'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Building2,
  Package,
  CreditCard,
  Target,
  FileText,
  Calendar,
  UtensilsCrossed,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  Image as ImageIcon,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  X,
  Upload,
  Pencil,
  Tag,
  DollarSign,
  Star,
  ImagePlus,
  Layers,
} from 'lucide-react';
import { stripXmlToCleanText } from '@/lib/ai/prompt-compiler';
import { estimatePromptTokens } from '@/lib/ai/prompt-assistant/versions';
import { stripPhotoUrlsFromText, extractPhotoUrlsFromText, type GalleryPhotoItem } from '@/lib/media/format';
import { groupGalleryIntoProducts, setPrimaryPhotoInGallery } from '@/lib/ai/product-gallery';
import { uploadChatMedia } from '@/app/actions/chat';
import { saveProductGallery } from '@/app/actions/settings';
import { suggestProductCatalogAi } from '@/app/actions/ai-catalog';
import { compressImageClient } from '@/lib/media/client-compression';

interface StructuredPromptWizardProps {
  initialPrompt?: string | null;
  initialStructuredData?: any;
  companyName?: string;
  onPromptCompiled: (compiledPrompt: string, structuredData?: any) => void;
  externalPromptText?: string | null;
  externalSyncNonce?: number;
  highlightedSection?: string | null;
}

interface TemplatePreset {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: any;
  badge: string;
  content: (company: string) => string;
}

export function StructuredPromptWizard({
  initialPrompt,
  initialStructuredData,
  companyName = 'Mi Empresa',
  onPromptCompiled,
  externalPromptText,
  externalSyncNonce = 0,
  highlightedSection,
}: StructuredPromptWizardProps) {
  // Inicializar limpiando cualquier residuo previo de etiquetas XML y URLs técnicas
  const [textPrompt, setTextPrompt] = useState<string>(() => {
    return stripPhotoUrlsFromText(stripXmlToCleanText(initialPrompt)) || '';
  });
  const lastAppliedSyncNonceRef = useRef<number>(0);

  // Inicializar la galería interna: si ya existe en structuredData se usa, de lo contrario se extraen del prompt inicial
  const [gallery, setGallery] = useState<GalleryPhotoItem[]>(() => {
    if (initialStructuredData?.gallery && Array.isArray(initialStructuredData.gallery) && initialStructuredData.gallery.length > 0) {
      return initialStructuredData.gallery;
    }
    return extractPhotoUrlsFromText(initialPrompt);
  });

  const [copied, setCopied] = useState(false);
  const [selectedTemplateModal, setSelectedTemplateModal] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string>('ecommerce');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Modal para agregar nueva foto al catálogo interno
  const [isAddPhotoModalOpen, setIsAddPhotoModalOpen] = useState(false);
  const [photoName, setPhotoName] = useState('');
  const [photoPrice, setPhotoPrice] = useState('');
  const [photoRole, setPhotoRole] = useState('principal');
  const [photoKeywords, setPhotoKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [isGeneratingAiTags, setIsGeneratingAiTags] = useState(false);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Soporte para fotos alternas / variantes de un producto específico
  const [targetProductForAlternate, setTargetProductForAlternate] = useState<{
    name: string;
    price?: string;
    keywords?: string[];
  } | null>(null);
  const [activePhotoByProduct, setActivePhotoByProduct] = useState<Record<string, string>>({});

  // Agrupación de fotos en productos consolidados con la portada SIEMPRE de primera
  const groupedProducts = React.useMemo(() => groupGalleryIntoProducts(gallery), [gallery]);

  // Modal para editar foto existente en el catálogo
  const [editingPhoto, setEditingPhoto] = useState<GalleryPhotoItem | null>(null);
  const [editPhotoName, setEditPhotoName] = useState('');
  const [editPhotoPrice, setEditPhotoPrice] = useState('');
  const [editPhotoRole, setEditPhotoRole] = useState('principal');
  const [editPhotoKeywords, setEditPhotoKeywords] = useState<string[]>([]);
  const [editKeywordInput, setEditKeywordInput] = useState('');
  const [isGeneratingEditAiTags, setIsGeneratingEditAiTags] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Función unificada para compilar y propagar hacia el padre (SettingsForm)
  const compileAndPropagate = (currentText: string, currentGallery: GalleryPhotoItem[]) => {
    let clean = stripPhotoUrlsFromText(currentText).trim();
    let compiled = clean;
    if (currentGallery.length > 0) {
      const galleryBlock =
        '\n\n=== CATÁLOGO VISUAL DE PRODUCTOS (DISPATCH INTERNO) ===\n' +
        currentGallery
          .map((g) => {
            const tags = g.keywords && g.keywords.length > 0 ? ` (Búsqueda/Sinónimos: ${g.keywords.join(', ')})` : '';
            const priceStr = g.price ? ` - Precio: ${g.price}` : '';
            const roleStr = g.imageRole ? ` [Vista: ${g.imageRole}]` : '';
            const productRef = g.productName && g.productName !== g.name ? ` (Producto: ${g.productName})` : '';
            return `- ${g.name}${productRef}${roleStr}${priceStr}${tags}: [foto: ${g.url}] (Despachar proactivamente con send_product_card cuando se consulte o mencione este modelo o sus precios; PROHIBIDO colocar la URL en el texto)`;
          })
          .join('\n');
      compiled += galleryBlock;
    }

    const structuredData = {
      ...(initialStructuredData || {}),
      gallery: currentGallery,
    };

    onPromptCompiled(compiled, structuredData);
    return { compiled, structuredData };
  };

  const handleTextChange = (newText: string) => {
    setTextPrompt(newText);
    compileAndPropagate(newText, gallery);
  };

  useEffect(() => {
    if (
      externalSyncNonce > 0 &&
      externalSyncNonce !== lastAppliedSyncNonceRef.current &&
      typeof externalPromptText === 'string'
    ) {
      lastAppliedSyncNonceRef.current = externalSyncNonce;
      const clean = stripPhotoUrlsFromText(stripXmlToCleanText(externalPromptText)) || '';
      setTextPrompt(clean);
      compileAndPropagate(clean, gallery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSyncNonce, externalPromptText]);

  const estimatedPromptTokens = estimatePromptTokens(textPrompt);

  const handleOpenAddModal = (targetProduct?: { name: string; price?: string; keywords?: string[] }) => {
    if (targetProduct) {
      setTargetProductForAlternate(targetProduct);
      setPhotoName(targetProduct.name);
      setPhotoPrice(targetProduct.price || '');
      setPhotoKeywords(targetProduct.keywords || []);
      setPhotoRole('alterna');
    } else {
      setTargetProductForAlternate(null);
      setPhotoName('');
      setPhotoPrice('');
      setPhotoKeywords([]);
      setPhotoRole('principal');
    }
    setKeywordInput('');
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoUploadError(null);
    setIsAddPhotoModalOpen(true);
  };

  const handleCloseAddModal = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setIsAddPhotoModalOpen(false);
    setSelectedPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoName('');
    setPhotoPrice('');
    setPhotoKeywords([]);
    setKeywordInput('');
    setPhotoUploadError(null);
    setTargetProductForAlternate(null);
  };

  const handleSetPrimaryPhoto = async (targetPhotoId: string, productName: string) => {
    try {
      const updatedGallery = setPrimaryPhotoInGallery(gallery, targetPhotoId);
      setGallery(updatedGallery);
      const { compiled } = compileAndPropagate(textPrompt, updatedGallery);
      await saveProductGallery(updatedGallery, compiled);
      setFeedbackBanner({
        type: 'success',
        text: `Foto de "${productName}" establecida como Portada Principal (primera en orden visual).`,
      });
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err: any) {
      console.error('[SET PRIMARY PHOTO ERROR]', err);
    }
  };

  const handleDeleteProductGroup = async (productName: string, photos: GalleryPhotoItem[]) => {
    if (
      !window.confirm(
        `¿Estás seguro de que deseas eliminar el producto "${productName}" y todas sus ${photos.length} fotos vinculadas?`
      )
    ) {
      return;
    }
    try {
      const photoIdsToRemove = new Set(photos.map((p) => p.id));
      const updatedGallery = gallery.filter((item) => !photoIdsToRemove.has(item.id));
      setGallery(updatedGallery);
      const { compiled } = compileAndPropagate(textPrompt, updatedGallery);
      await saveProductGallery(updatedGallery, compiled);
      setFeedbackBanner({
        type: 'success',
        text: `Producto "${productName}" y sus fotos eliminados con éxito.`,
      });
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err: any) {
      console.error('[DELETE PRODUCT GROUP ERROR]', err);
    }
  };

  useEffect(() => {
    if (isAddPhotoModalOpen || selectedTemplateModal || !!editingPhoto) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isAddPhotoModalOpen, selectedTemplateModal, editingPhoto]);

  const handleOpenEditModal = (item: GalleryPhotoItem) => {
    setEditingPhoto(item);
    setEditPhotoName(item.productName || item.name);
    setEditPhotoPrice(item.price || '');
    setEditPhotoRole(item.imageRole || 'principal');
    setEditPhotoKeywords(item.keywords || []);
    setEditKeywordInput('');
    setEditError(null);
  };

  const handleCloseEditModal = () => {
    setEditingPhoto(null);
    setEditPhotoName('');
    setEditPhotoPrice('');
    setEditPhotoRole('principal');
    setEditPhotoKeywords([]);
    setEditKeywordInput('');
    setEditError(null);
    setIsSavingEdit(false);
  };

  const handleSaveEditedPhoto = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!editingPhoto || !editPhotoName.trim()) {
      setEditError('El nombre o título del producto no puede estar vacío.');
      return;
    }
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const cleanRole = editPhotoRole.trim() || 'principal';
      const prodName = editPhotoName.trim();
      const updatedGallery = gallery.map((item) =>
        item.id === editingPhoto.id
          ? {
              ...item,
              name: prodName,
              productName: prodName,
              imageRole: cleanRole,
              price: editPhotoPrice.trim() || undefined,
              keywords: editPhotoKeywords.length > 0 ? editPhotoKeywords : undefined,
            }
          : item
      );
      setGallery(updatedGallery);
      const { compiled } = compileAndPropagate(textPrompt, updatedGallery);
      await saveProductGallery(updatedGallery, compiled);

      setFeedbackBanner({
        type: 'success',
        text: `Producto "${prodName}" actualizado y sincronizado con éxito.`,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
      handleCloseEditModal();
    } catch (err: any) {
      console.error('[EDIT PHOTO ERROR]', err);
      setEditError(err?.message || 'Error al guardar los cambios en la base de datos.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleAutocompleteWithGemini = async (isEdit = false) => {
    const nameToUse = isEdit ? editPhotoName : photoName;
    if (!nameToUse.trim()) {
      if (isEdit) {
        setEditError('Escribe primero el nombre o modelo del producto para sugerir.');
      } else {
        setPhotoUploadError('Escribe primero el nombre o modelo del producto para sugerir.');
      }
      return;
    }

    if (isEdit) {
      setIsGeneratingEditAiTags(true);
      setEditError(null);
    } else {
      setIsGeneratingAiTags(true);
      setPhotoUploadError(null);
    }

    try {
      const res = await suggestProductCatalogAi({
        productName: nameToUse,
        imageUrl: isEdit ? editingPhoto?.url : undefined,
      });

      if (res.success && res.data) {
        if (isEdit) {
          if (res.data.name && (!editPhotoName.trim() || editPhotoName.length < 5)) {
            setEditPhotoName(res.data.name);
          }
          const mergedTags = Array.from(new Set([...editPhotoKeywords, ...(res.data.keywords || [])]));
          setEditPhotoKeywords(mergedTags);
        } else {
          if (res.data.name && (!photoName.trim() || photoName.length < 5)) {
            setPhotoName(res.data.name);
          }
          const mergedTags = Array.from(new Set([...photoKeywords, ...(res.data.keywords || [])]));
          setPhotoKeywords(mergedTags);
        }
      } else {
        throw new Error(res.error || 'No se pudieron generar sugerencias.');
      }
    } catch (err: any) {
      if (isEdit) setEditError(err.message);
      else setPhotoUploadError(err.message);
    } finally {
      if (isEdit) setIsGeneratingEditAiTags(false);
      else setIsGeneratingAiTags(false);
    }
  };

  const handleAddKeyword = (kw: string, isEdit = false) => {
    const clean = kw.trim().replace(/^,|,$/g, '');
    if (!clean) return;
    if (isEdit) {
      if (!editPhotoKeywords.includes(clean)) {
        setEditPhotoKeywords([...editPhotoKeywords, clean]);
      }
      setEditKeywordInput('');
    } else {
      if (!photoKeywords.includes(clean)) {
        setPhotoKeywords([...photoKeywords, clean]);
      }
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (kwToRemove: string, isEdit = false) => {
    if (isEdit) {
      setEditPhotoKeywords(editPhotoKeywords.filter((k) => k !== kwToRemove));
    } else {
      setPhotoKeywords(photoKeywords.filter((k) => k !== kwToRemove));
    }
  };

  const handleFileSelection = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setPhotoUploadError('Por favor selecciona una imagen válida (JPG, PNG o WebP).');
      return;
    }
    setPhotoUploadError(null);
    try {
      const compressed = await compressImageClient(file, 1200, 0.82);
      setSelectedPhotoFile(compressed);
      setPhotoPreviewUrl(URL.createObjectURL(compressed));
    } catch {
      setSelectedPhotoFile(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    }

    // Si aún no ha escrito un nombre, sugerir el nombre base del archivo sin extensión
    if (!photoName.trim()) {
      const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setPhotoName(cleanFileName.charAt(0).toUpperCase() + cleanFileName.slice(1));
    }
  };

  const handleSavePhotoToGallery = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!selectedPhotoFile) {
      setPhotoUploadError('Debes seleccionar una imagen.');
      return;
    }
    if (!photoName.trim()) {
      setPhotoUploadError('Ingresa el nombre del producto o servicio (ej: Plan Premium, Modelo Estándar).');
      return;
    }

    try {
      setIsUploadingPhoto(true);
      setPhotoUploadError(null);

      const formData = new FormData();
      formData.append('file', selectedPhotoFile);

      const result = await uploadChatMedia(formData);
      if (!result.url) {
        throw new Error('No se recibió la URL de la imagen.');
      }

      const cleanRole = photoRole.trim() || (targetProductForAlternate ? 'alterna' : 'principal');
      const isHero = !targetProductForAlternate && (cleanRole === 'principal' || gallery.every((g) => (g.productName || g.name) !== photoName.trim()));

      const newPhotoItem: GalleryPhotoItem = {
        id: `photo-${Date.now()}`,
        name: photoName.trim(),
        productName: photoName.trim(),
        imageRole: cleanRole,
        url: result.url,
        price: photoPrice.trim() || undefined,
        keywords: photoKeywords.length > 0 ? photoKeywords : undefined,
        isHero,
      };

      let updatedGallery: GalleryPhotoItem[];
      if (targetProductForAlternate) {
        const canonTarget = targetProductForAlternate.name.toLowerCase();
        const lastIndexOfProduct = gallery
          .map((g) => (g.productName || g.name || '').trim().toLowerCase())
          .lastIndexOf(canonTarget);
        if (lastIndexOfProduct !== -1) {
          updatedGallery = [
            ...gallery.slice(0, lastIndexOfProduct + 1),
            newPhotoItem,
            ...gallery.slice(lastIndexOfProduct + 1),
          ];
        } else {
          updatedGallery = [...gallery, newPhotoItem];
        }
      } else {
        updatedGallery = [...gallery, newPhotoItem];
      }

      setGallery(updatedGallery);
      const { compiled } = compileAndPropagate(textPrompt, updatedGallery);

      // Guardar de inmediato en la base de datos atómicamente sin recargar la página
      try {
        await saveProductGallery(updatedGallery, compiled);
        setFeedbackBanner({
          type: 'success',
          text: targetProductForAlternate
            ? `Foto alterna agregada con éxito al producto "${targetProductForAlternate.name}".`
            : `Producto "${newPhotoItem.name}" guardado y sincronizado con éxito.`,
        });
        setTimeout(() => setFeedbackBanner(null), 5000);
      } catch (dbErr: any) {
        console.warn('[DB AUTO-SAVE WARNING]', dbErr);
      }

      handleCloseAddModal();
    } catch (err: any) {
      console.error('[PHOTO UPLOAD ERROR]', err);
      setPhotoUploadError(err?.message || 'Error al subir la imagen a almacenamiento.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (id: string, name: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la foto de "${name}" del catálogo?`)) {
      return;
    }

    try {
      setIsDeletingId(id);
      const updatedGallery = gallery.filter((item) => item.id !== id);
      setGallery(updatedGallery);
      const { compiled, structuredData } = compileAndPropagate(textPrompt, updatedGallery);

      // Actualizar inmediatamente en la base de datos
      await saveProductGallery(updatedGallery, compiled);

      setFeedbackBanner({
        type: 'success',
        text: `Foto "${name}" eliminada del catálogo y actualizada en la base de datos.`,
      });
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err: any) {
      console.error('[DELETE PHOTO ERROR]', err);
      setFeedbackBanner({
        type: 'error',
        text: 'Error al actualizar en base de datos: ' + (err?.message || 'Error desconocido'),
      });
    } finally {
      setIsDeletingId(null);
    }
  };

  // Plantillas prediseñadas para orientar al cliente según su tipo de negocio
  const TEMPLATES: TemplatePreset[] = [
    {
      id: 'ecommerce',
      title: 'Comercio, Ventas & Tiendas',
      category: 'Productos Físicos',
      description: 'Ideal para negocios que venden productos, envían a domicilio y reciben pagos por transferencia o contra entrega.',
      icon: Package,
      badge: 'Más Usado',
      content: (company) => `# MI EMPRESA: ${company}
Ubicación y cobertura: Colombia (Envíos a todo el país).
Descripción: Tienda especializada en productos de alta calidad con atención personalizada.

# PRODUCTOS, CATÁLOGO Y PRECIOS:
- Producto 1 ($50.000 COP): Incluye garantía y atención directa.
- Producto 2 ($100.000 COP): Nuestro artículo más vendido, incluye envío prioritario.
- Producto 3 ($150.000 COP): Paquete premium con obsequio especial.

# POLÍTICAS, ENVÍOS Y MÉTODOS DE PAGO:
- Métodos de pago: Transferencia Bancolombia, Nequi, Daviplata, Efectivo contra entrega en ciudades principales.
- Envíos: Despachos en 24 a 48 horas hábiles por transportadora nacional (Coordinadora / Interrapidísimo / Envía).
- Costo de envío: $12.000 COP o Gratis por compras superiores a $150.000 COP.

# INSTRUCCIONES DE ATENCIÓN:
- Responder de forma breve, cálida y humana (máximo 2 a 3 líneas por mensaje).
- Si el cliente solicita fotos o catálogo, confirmar disponibilidad con entusiasmo y enviar de inmediato los modelos disponibles.
- Guiar siempre al cliente con amabilidad al cierre de su compra.`,
    },
    {
      id: 'services',
      title: 'Servicios, Asesoría & Citas',
      category: 'Agendamiento',
      description: 'Para consultorías, centros de estética, barberías, academias o clínicas que agendan turnos.',
      icon: Calendar,
      badge: 'Citas & Turnos',
      content: (company) => `# MI NEGOCIO: ${company}
Ubicación: Calle Principal #12-34, Local 2. Atención presencial y virtual.
Descripción: Especialistas en atención profesional y asesoría personalizada.

# SERVICIOS Y TARIFAS:
- Servicio Básico ($60.000 COP): Duración de 45 minutos. Incluye valoración inicial.
- Servicio Completo ($120.000 COP): Duración de 90 minutos. Incluye procedimiento integral y seguimiento.
- Valoración Inicial ($30.000 COP): Se descuenta del valor total si tomas el servicio.

# HORARIOS Y AGENDAMIENTO:
- Horario de atención: Lunes a Sábado de 8:00 AM a 7:00 PM.
- Citas: Se programan con confirmación previa. Te enviamos el enlace para que elijas la hora y especialista de tu preferencia.

# MÉTODOS DE PAGO:
- Nequi, Daviplata, Transferencia Bancolombia, Tarjetas Débito/Crédito y Efectivo en el local.

# PAUTAS DE ATENCIÓN:
- Mantener un tono cercano, profesional y tranquilizador.
- Indicar siempre el tiempo de duración y lo que incluye el servicio antes de invitar a agendar.`,
    },
    {
      id: 'gastronomy',
      title: 'Restaurante & Comidas Rápidas',
      category: 'Gastronomía',
      description: 'Para restaurantes, cafeterías o reposterías con pedidos en mesa, domicilios y reservas.',
      icon: UtensilsCrossed,
      badge: 'Domicilios',
      content: (company) => `# RESTAURANTE: ${company}
Ubicación: Sector Centro. Servicio en mesa y domicilios.
Especialidad: Comida artesanal, platos a la carta y menú del día.

# MENÚ Y PRECIOS:
- Plato Especial ($28.000 COP): Incluye proteína seleccionada, guarniciones y bebida natural.
- Menú Ejecutivo ($18.000 COP): Disponible de Lunes a Viernes de 12:00 PM a 3:00 PM.
- Bebidas y Adicionales: Jugos naturales ($6.000 COP), Porción extra ($5.000 COP).

# DOMICILIOS Y PEDIDOS:
- Tiempo estimado de entrega: 35 a 45 minutos.
- Costo de domicilio: $5.000 COP en el perímetro urbano.
- Métodos de pago: Nequi, Daviplata, Datáfono inalámbrico y Efectivo contra entrega.

# PAUTAS DE ATENCIÓN:
- Saludar con alegría y consultar si el pedido es para consumir en el local o a domicilio.
- Detallar el pedido para confirmación del cliente antes de despachar a cocina.`,
    },
  ];

  const handleApplyTemplate = (templateId: string) => {
    const selected = TEMPLATES.find((t) => t.id === templateId);
    if (!selected) return;

    if (
      textPrompt.trim().length > 0 &&
      !window.confirm('¿Deseas reemplazar el texto actual con esta plantilla guía?')
    ) {
      return;
    }

    const templateText = selected.content(companyName);
    handleTextChange(templateText);
    setSelectedTemplateModal(false);
  };

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabecera y Descripción */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#232A3B] pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
            Instrucciones del Asistente Comercial
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Escribe con tus propias palabras la información de tu negocio. La IA responderá a tus clientes siguiendo estas pautas.
          </p>
        </div>

        {/* Botón Principal para Insertar Plantilla Guía */}
        <button
          type="button"
          onClick={() => setSelectedTemplateModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-semibold shadow-xs transition cursor-pointer self-start sm:self-auto"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Insertar Plantilla Guía</span>
        </button>
      </div>

      {/* Banner de Tranquilidad y Control Total */}
      <div className="p-3.5 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-[#0f172a] dark:to-[#1e1b4b] border border-blue-200/70 dark:border-blue-900/40 rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0 mt-0.5 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Control Total en Texto Libre</span>
              <span className="text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                Sin Enlaces Técnicos
              </span>
            </h4>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Redacta con total libertad. <strong>Synqo CRM inyecta automáticamente en segundo plano</strong> el blindaje de precios (no inventar tarifas no autorizadas), el tono de WhatsApp (1 a 3 líneas), el envío de fotos de tus productos desde la galería interna y el relevo imperceptible a un asesor humano cuando sea necesario.
            </p>
          </div>
        </div>
      </div>

      {/* 4 Guías Rápidas de Estructura */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-1">
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-blue-500" />
            <span>1. Tu Negocio</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
            Nombre comercial, a qué se dedica la empresa y ciudad o zona de cobertura.
          </p>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-1">
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-emerald-500" />
            <span>2. Catálogo y Precios</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
            Lista de productos o servicios con precios exactos y qué incluye cada uno.
          </p>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-1">
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-amber-500" />
            <span>3. Pagos y Envíos</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
            Cuentas (Nequi, Daviplata, Bancolombia), pago contra entrega y tiempos de envío.
          </p>
        </div>

        <div className="p-3 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl space-y-1">
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-purple-500" />
            <span>4. Pautas Especiales</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
            Pautas puntuales (ej: pedir fotos del espacio, no dar diagnósticos médicos, agendar citas).
          </p>
        </div>
      </div>

      {/* SECCIÓN INTERNA: Galería & Catálogo Visual de Fotos de Productos */}
      <div id="product-gallery-section" className="p-4 bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#232A3B] rounded-2xl space-y-3.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-[#1E2433] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-900/40 text-[#0052FF] dark:text-[#00D2FF] rounded-lg">
                <ImageIcon className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Catálogo Visual de Productos (WhatsApp)
              </h4>
              <span className="text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                {groupedProducts.length} {groupedProducts.length === 1 ? 'producto' : 'productos'} · {gallery.length} {gallery.length === 1 ? 'foto' : 'fotos'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Organiza tus productos y agrega fotos alternas (ángulos, detalles o variantes) a cada uno. La IA y los asesores podrán despacharlas por WhatsApp sin duplicar productos.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-100 transition cursor-pointer shadow-xs self-start sm:self-auto shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Producto</span>
          </button>
        </div>

        {/* Notificación de Sincronización en Base de Datos */}
        {feedbackBanner && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200 ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackBanner.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{feedbackBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Grid de Productos Consolidados o Estado Vacío */}
        {groupedProducts.length === 0 ? (
          <div
            onClick={() => handleOpenAddModal()}
            className="border-2 border-dashed border-slate-200 dark:border-[#232A3B] hover:border-blue-400 dark:hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer transition bg-slate-50/50 dark:bg-[#090A0F]/50 group"
          >
            <div className="mx-auto w-10 h-10 rounded-full bg-blue-50 dark:bg-[#1A1F2C] text-[#0052FF] dark:text-[#00D2FF] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              No tienes productos en el catálogo visual aún
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-md mx-auto">
              Haz clic aquí para agregar tu primer producto con su foto de portada y luego podrás añadirle fotos alternas (ángulos, detalles o medidas).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {groupedProducts.map((product) => {
              const activePhotoId = activePhotoByProduct[product.productName] || product.primaryPhoto.id;
              const activePhoto =
                product.allPhotos.find((p) => p.id === activePhotoId) || product.primaryPhoto;
              const isViewingPrimary = activePhoto.id === product.primaryPhoto.id;

              return (
                <div
                  key={product.id}
                  className="group relative rounded-2xl border border-slate-200 dark:border-[#232A3B] bg-white dark:bg-[#131722] overflow-hidden flex flex-col justify-between shadow-xs hover:border-blue-400/80 dark:hover:border-blue-500/80 transition-all"
                >
                  {/* 1. Vista Previa de Imagen Activa */}
                  <div className="relative aspect-video sm:aspect-[4/3] w-full bg-slate-100 dark:bg-slate-900/80 overflow-hidden">
                    <img
                      src={activePhoto.url}
                      alt={product.productName}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                      loading="lazy"
                    />

                    {/* Badge Portada (Siempre primera) o Vista Alterna */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 pointer-events-none">
                      {isViewingPrimary ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/85 text-amber-300 text-[10px] font-bold backdrop-blur-xs border border-amber-400/30 shadow-xs">
                          <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                          <span>Portada Principal</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs">
                          <span>Vista: {activePhoto.imageRole || 'Alterna'}</span>
                        </span>
                      )}
                    </div>

                    {/* Contador de fotos y enlace externo */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                      <span className="px-2 py-0.5 rounded-full bg-slate-900/80 text-white text-[10px] font-mono font-bold backdrop-blur-xs">
                        {product.allPhotos.length} {product.allPhotos.length === 1 ? 'foto' : 'fotos'}
                      </span>
                      <a
                        href={activePhoto.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded-full bg-black/60 text-white hover:bg-black/90 transition"
                        title="Ver imagen en tamaño completo"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {/* Precio en la foto si existe */}
                    {product.price && (
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-slate-900/85 text-emerald-300 text-[11px] font-bold backdrop-blur-xs border border-emerald-500/20">
                        {product.price}
                      </span>
                    )}
                  </div>

                  {/* 2. Mini-Tira de Miniaturas del Producto (La foto principal siempre de primera) */}
                  <div className="p-2.5 border-b border-slate-100 dark:border-[#1E2433] bg-slate-50/70 dark:bg-[#090A0F]/60">
                    <div className="flex items-center justify-between gap-1 mb-1.5 px-0.5">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        <span>Álbum ({product.allPhotos.length}):</span>
                      </span>
                      {activePhoto && !isViewingPrimary && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryPhoto(activePhoto.id, product.productName)}
                          className="text-[9.5px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                          title="Fijar esta imagen como la Portada Principal (primera en orden visual)"
                        >
                          <Star className="w-2.5 h-2.5 fill-current" />
                          <span>Hacer Portada</span>
                        </button>
                      )}
                    </div>

                    {/* Tira horizontal de miniaturas */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                      {product.allPhotos.map((photo, pIdx) => {
                        const isThisActive = photo.id === activePhoto.id;
                        const isThisPrimary = pIdx === 0;

                        return (
                          <div key={photo.id} className="relative group/thumb shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setActivePhotoByProduct((prev) => ({
                                  ...prev,
                                  [product.productName]: photo.id,
                                }))
                              }
                              className={`relative w-11 h-11 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                                isThisActive
                                  ? 'border-[#0052FF] ring-2 ring-blue-500/30'
                                  : isThisPrimary
                                  ? 'border-amber-400/80 hover:border-amber-500'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                              }`}
                              title={`${
                                isThisPrimary
                                  ? 'Foto Principal / Portada'
                                  : `Foto Alterna: ${photo.imageRole || 'Ángulo'}`
                              } (Clic para previsualizar)`}
                            >
                              <img
                                src={photo.url}
                                alt={photo.name}
                                className="w-full h-full object-cover"
                              />
                              {isThisPrimary && (
                                <span
                                  className="absolute bottom-0 right-0 p-0.5 bg-amber-500 text-white rounded-tl-md shadow-xs"
                                  title="Foto de Portada"
                                >
                                  <Star className="w-2 h-2 fill-current" />
                                </span>
                              )}
                            </button>

                            {/* Botón rápido para eliminar SOLO esta foto alterna (si hay más de 1 foto) */}
                            {!isThisPrimary && (
                              <button
                                type="button"
                                disabled={isDeletingId === photo.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePhoto(photo.id, `${photo.name} (${photo.imageRole || 'alterna'})`);
                                }}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center cursor-pointer shadow-xs hover:bg-rose-600 disabled:opacity-50"
                                title="Eliminar solo este ángulo/foto alterna"
                              >
                                {isDeletingId === photo.id ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  <X className="w-2.5 h-2.5" />
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* Botón "+" para añadir foto alterna directamente en la tira */}
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenAddModal({
                            name: product.productName,
                            price: product.price,
                            keywords: product.keywords,
                          })
                        }
                        className="w-11 h-11 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0052FF] dark:hover:border-[#00D2FF] flex flex-col items-center justify-center text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition shrink-0 cursor-pointer"
                        title={`Añadir otro ángulo, detalle o variante a "${product.productName}"`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 3. Información del Producto & Acciones */}
                  <div className="p-3 flex flex-col gap-1.5 bg-white dark:bg-[#131722] flex-1 justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex-1"
                          title={product.productName}
                        >
                          {product.productName}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(product.primaryPhoto)}
                            className="p-1 text-slate-400 hover:text-[#0052FF] dark:hover:text-[#00D2FF] hover:bg-slate-100 dark:hover:bg-[#1A1F2C] rounded-md transition cursor-pointer"
                            title="Editar datos del producto o palabras clave"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteProductGroup(product.productName, product.allPhotos)
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition cursor-pointer"
                            title="Eliminar producto completo y todas sus fotos"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {product.keywords && product.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {product.keywords.slice(0, 3).map((k, i) => (
                            <span
                              key={i}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium truncate max-w-[95px]"
                            >
                              #{k}
                            </span>
                          ))}
                          {product.keywords.length > 3 && (
                            <span className="text-[9px] text-slate-400 font-medium">
                              +{product.keywords.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Botón rápido "+ Añadir foto alterna" */}
                    <div className="pt-2 mt-1 border-t border-slate-100 dark:border-[#1E2433]">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenAddModal({
                            name: product.productName,
                            price: product.price,
                            keywords: product.keywords,
                          })
                        }
                        className="w-full py-1.5 px-2 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-[#0052FF] dark:text-[#00D2FF] text-[11px] font-semibold border border-blue-200/60 dark:border-blue-900/50 flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        <span>Añadir foto alterna / ángulo</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Tarjeta de "+ Nuevo Producto" al final del grid */}
            <button
              type="button"
              onClick={() => handleOpenAddModal()}
              className="border-2 border-dashed border-slate-200 dark:border-[#232A3B] hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition bg-slate-50/40 dark:bg-[#090A0F]/40 group min-h-[220px]"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-400 group-hover:text-[#0052FF] dark:group-hover:text-[#00D2FF] group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 flex items-center justify-center mb-2 transition">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                + Agregar Nuevo Producto
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-[200px]">
                Crea un nuevo producto con su foto de portada
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Barra de Acciones del Editor de Texto */}
      <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-slate-600 dark:text-slate-300 font-bold">
            Editor de Instrucciones del Negocio:
          </span>
          <button
            type="button"
            onClick={() => handleApplyTemplate('ecommerce')}
            className="text-[#0052FF] dark:text-[#00D2FF] hover:underline font-semibold cursor-pointer"
          >
            Pegar Plantilla Rápida
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer font-medium"
            title="Copiar texto actual"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          {textPrompt.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('¿Estás seguro de que deseas vaciar el texto del asistente?')) {
                  handleTextChange('');
                }
              }}
              className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer font-medium ml-1"
              title="Limpiar editor"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {highlightedSection && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>Sección actualizada por el asistente: <strong>## {highlightedSection}</strong></span>
        </div>
      )}

      {/* Editor de Texto Libre Principal (100% Limpio, sin URLs técnicas) */}
      <textarea
        ref={textareaRef}
        rows={18}
        value={textPrompt}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder={`Escribe aquí las instrucciones de tu negocio con total naturalidad...\n\nEjemplo:\n## Empresa\n${companyName} — Ciudad y cobertura.\n\n## Catálogo\n- Producto o servicio principal ($Precio): detalles clave.\n\n## Pagos\n- Transferencia, tarjeta o efectivo.\n- Envíos o modalidad de entrega.`}
        className={`w-full text-xs font-mono leading-relaxed p-4 rounded-xl border ${
          highlightedSection
            ? 'border-emerald-400 dark:border-emerald-500/70 ring-2 ring-emerald-400/20'
            : 'border-slate-200 dark:border-[#232A3B]'
        } focus:outline-none focus:border-[#0052FF] dark:focus:border-[#00D2FF] bg-slate-50/70 dark:bg-[#090A0F] focus:bg-white dark:focus:bg-[#090A0F] text-slate-800 dark:text-slate-200 shadow-inner resize-y transition-colors`}
      />

      {/* Pie del Editor con Conteo y Tamaño del Prompt */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span>{textPrompt.length} caracteres redactados</span>
          {textPrompt.length > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full font-sans font-semibold text-[10px] ${
                estimatedPromptTokens <= 1800
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
              }`}
              title="Los prompts concisos hacen que el bot responda más rápido y con mayor precisión."
            >
              {estimatedPromptTokens <= 1800
                ? `Prompt ágil (~${estimatedPromptTokens} tok/msg)`
                : `Prompt extenso (~${estimatedPromptTokens} tok/msg · ideal ≤ 1.800)`}
            </span>
          )}
        </div>
        <span className="text-emerald-600 dark:text-emerald-400 font-medium font-sans">
          ✓ Formato 100% limpio sin URLs técnicas ni etiquetas XML
        </span>
      </div>

      {/* Modal para Agregar Foto al Catálogo Visual Interno (Portaled a document.body) */}
      {isAddPhotoModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${targetProductForAlternate ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-blue-50 dark:bg-blue-900/40 text-[#0052FF] dark:text-[#00D2FF]'}`}>
                  {targetProductForAlternate ? <ImagePlus className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {targetProductForAlternate
                    ? `Añadir Foto Alterna a "${targetProductForAlternate.name}"`
                    : 'Agregar Nuevo Producto con Foto'}
                </h4>
              </div>
              <button
                type="button"
                onClick={handleCloseAddModal}
                disabled={isUploadingPhoto}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3.5 [scrollbar-width:thin]">
              {/* Si es una foto alterna de un producto existente: mostrar tarjeta de contexto pre-llenada */}
              {targetProductForAlternate ? (
                <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/50 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        Producto:
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {targetProductForAlternate.name}
                      </span>
                    </div>
                    {targetProductForAlternate.price && (
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 font-mono text-[11px]">
                        {targetProductForAlternate.price}
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-blue-700 dark:text-blue-300 leading-snug">
                    Esta foto se vinculará como un ángulo o variante de este producto. No creará un producto aparte en el catálogo ni en el chat.
                  </p>
                </div>
              ) : (
                /* Campo Nombre del Producto tradicional si es un nuevo producto */
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Nombre o Modelo del Producto <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAutocompleteWithGemini(false)}
                      disabled={isGeneratingAiTags || isUploadingPhoto || !photoName.trim()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition cursor-pointer disabled:opacity-50"
                      title="Genera sinónimos de búsqueda y optimiza el nombre usando Gemini 1.5 Flash (Gratuito)"
                    >
                      {isGeneratingAiTags ? (
                        <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                      )}
                      <span>✨ Autocompletar con Gemini</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Cocina Mediana, Casita de Madera, Combo Completo"
                    value={photoName}
                    onChange={(e) => setPhotoName(e.target.value)}
                    disabled={isUploadingPhoto}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    Este nombre permite a la IA asociar la foto cuando un cliente pregunte por este modelo en WhatsApp.
                  </p>
                </div>
              )}

              {/* Precio y Vista/Rol de la Imagen */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!targetProductForAlternate && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Precio (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: $250.000 COP"
                      value={photoPrice}
                      onChange={(e) => setPhotoPrice(e.target.value)}
                      disabled={isUploadingPhoto}
                      className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                    />
                  </div>
                )}

                <div className={targetProductForAlternate ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vista / Ángulo de la Foto
                  </label>
                  {/* Chips sugeridos rápidos de un clic */}
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {[
                      { label: 'Portada', value: 'principal' },
                      { label: 'Interior / Abierta', value: 'interior' },
                      { label: 'Vista Lateral', value: 'lateral' },
                      { label: 'Medidas / Detalles', value: 'medidas' },
                      { label: 'Variante / Color', value: 'variante' },
                    ].map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setPhotoRole(preset.value)}
                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border transition cursor-pointer ${
                          photoRole.toLowerCase() === preset.value.toLowerCase()
                            ? 'bg-[#0052FF] text-white border-[#0052FF]'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Ej: principal, interior, lateral, medidas..."
                    value={photoRole}
                    onChange={(e) => setPhotoRole(e.target.value)}
                    disabled={isUploadingPhoto}
                    className="w-full text-xs px-3 py-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Permite que la IA o los asesores identifiquen exactamente qué muestra esta imagen.
                  </p>
                </div>
              </div>

              {/* Palabras clave (solo si es nuevo producto) */}
              {!targetProductForAlternate && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Palabras clave y sinónimos de WhatsApp (Tags de búsqueda rápida)
                  </label>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <input
                      type="text"
                      placeholder="Escribe un sinónimo (ej: cocinita, madera) y presiona Enter"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          handleAddKeyword(keywordInput, false);
                        }
                      }}
                      disabled={isUploadingPhoto}
                      className="flex-1 text-xs px-3 py-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddKeyword(keywordInput, false)}
                      disabled={!keywordInput.trim() || isUploadingPhoto}
                      className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40"
                    >
                      + Tag
                    </button>
                  </div>
                  {photoKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-100 dark:border-[#1E2433]">
                      {photoKeywords.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(tag, false)}
                            className="hover:text-rose-500 cursor-pointer ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    La IA vinculará este producto cuando los prospectos pregunten usando cualquiera de estas palabras.
                  </p>
                </div>
              )}

              {/* Selector / Previsualización de Imagen */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Imagen del Producto (JPG, PNG, WebP) <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={modalFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelection(f);
                  }}
                  className="hidden"
                />

                {photoPreviewUrl ? (
                  <div className="relative rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden bg-black/5 aspect-video flex items-center justify-center">
                    <img
                      src={photoPreviewUrl}
                      alt="Previsualización"
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/90 text-white text-[11px] font-semibold backdrop-blur-xs transition cursor-pointer"
                    >
                      Cambiar Imagen
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => modalFileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFileSelection(f);
                    }}
                    className="border-2 border-dashed border-slate-200 dark:border-[#232A3B] hover:border-blue-400 dark:hover:border-blue-500 rounded-xl p-5 text-center cursor-pointer transition bg-slate-50/50 dark:bg-[#090A0F]/50"
                  >
                    <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Selecciona o arrastra una imagen aquí
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Formatos soportados: JPG, PNG o WebP (máx. 10 MB)
                    </span>
                  </div>
                )}
              </div>

              {photoUploadError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{photoUploadError}</span>
                </div>
              )}
            </div>

            {/* Botones de Acción Pinned */}
            <div className="shrink-0 flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#0E131F]">
              <button
                type="button"
                onClick={handleCloseAddModal}
                disabled={isUploadingPhoto}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePhotoToGallery}
                disabled={isUploadingPhoto || !selectedPhotoFile || !photoName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isUploadingPhoto ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando foto...</span>
                  </>
                ) : targetProductForAlternate ? (
                  <span>Guardar Foto Alterna</span>
                ) : (
                  <span>Guardar Nuevo Producto</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal para Editar Nombre de Foto Existente (Portaled a document.body) */}
      {editingPhoto && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-[#0052FF] dark:text-[#00D2FF]">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Editar Nombre del Producto
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Cambia la etiqueta que usa la IA para identificar esta foto
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isSavingEdit}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3.5 [scrollbar-width:thin]">
              {/* Previsualización actual */}
              <div className="relative rounded-xl border border-slate-200 dark:border-[#232A3B] overflow-hidden bg-black/5 aspect-video flex items-center justify-center">
                <img
                  src={editingPhoto.url}
                  alt={editingPhoto.name}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Input de Nombre y Autocompletar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>Nombre / Modelo del Producto:</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleAutocompleteWithGemini(true)}
                    disabled={isGeneratingEditAiTags || isSavingEdit || !editPhotoName.trim()}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition cursor-pointer disabled:opacity-50"
                    title="Genera sinónimos de búsqueda y optimiza el nombre usando Gemini 1.5 Flash (Gratuito)"
                  >
                    {isGeneratingEditAiTags ? (
                      <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    )}
                    <span>✨ Autocompletar con Gemini</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={editPhotoName}
                  onChange={(e) => setEditPhotoName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEditedPhoto();
                    }
                  }}
                  disabled={isSavingEdit}
                  placeholder="Ej: Cocina Mediana, Casita de Madera..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#232A3B] bg-slate-50 dark:bg-[#090A0F] text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  autoFocus
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  La IA enviará esta imagen cuando el cliente pregunte o pida fotos de este producto exacto.
                </p>
              </div>

              {/* Precio y Vista/Etiqueta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Precio (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: $250.000 COP"
                    value={editPhotoPrice}
                    onChange={(e) => setEditPhotoPrice(e.target.value)}
                    disabled={isSavingEdit}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vista / Etiqueta de la Foto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: principal, personalizada, de lado..."
                    value={editPhotoRole}
                    onChange={(e) => setEditPhotoRole(e.target.value)}
                    disabled={isSavingEdit}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Permite a la IA saber qué ángulo o variante de la foto enviar.
                  </p>
                </div>
              </div>

              {/* Palabras clave / Sinónimos para WhatsApp */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Palabras clave y sinónimos de WhatsApp (Tags de búsqueda rápida)
                </label>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <input
                    type="text"
                    placeholder="Escribe un sinónimo (ej: cocinita, madera) y presiona Enter"
                    value={editKeywordInput}
                    onChange={(e) => setEditKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddKeyword(editKeywordInput, true);
                      }
                    }}
                    disabled={isSavingEdit}
                    className="flex-1 text-xs px-3 py-1.5 bg-slate-50 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0052FF]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddKeyword(editKeywordInput, true)}
                    disabled={!editKeywordInput.trim() || isSavingEdit}
                    className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    + Tag
                  </button>
                </div>
                {editPhotoKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-[#090A0F] border border-slate-100 dark:border-[#1E2433]">
                    {editPhotoKeywords.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(tag, true)}
                          className="hover:text-rose-500 cursor-pointer ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {editError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

            </div>

            {/* Botones de Acción Pinned */}
            <div className="shrink-0 flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#0E131F]">
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isSavingEdit}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditedPhoto}
                disabled={isSavingEdit || !editPhotoName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <span>Guardar Nombre</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Selector de Plantillas Guía por Nicho (Portaled a document.body) */}
      {selectedTemplateModal && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-[#232A3B] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-slate-900 dark:text-slate-100">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#090A0F]">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#0052FF] dark:text-[#00D2FF]" />
                  Seleccionar Plantilla Guía para tu Negocio
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Elige la que mejor se adapte a tu rubro. Podrás editar todos los precios, nombres y políticas libremente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1A1F2C] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 [scrollbar-width:thin]">
              {/* Lista de Plantillas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TEMPLATES.map((tpl) => {
                  const Icon = tpl.icon;
                  const isSelected = previewTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setPreviewTemplateId(tpl.id)}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-2.5 ${
                        isSelected
                          ? 'border-[#0052FF] bg-blue-50/50 dark:bg-[#0052FF]/10 shadow-xs'
                          : 'border-slate-200 dark:border-[#232A3B] bg-slate-50/60 dark:bg-[#090A0F] hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className={`p-2 rounded-lg ${isSelected ? 'bg-[#0052FF] text-white' : 'bg-slate-200 dark:bg-[#1A1F2C] text-slate-600 dark:text-slate-400'}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                            {tpl.badge}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {tpl.title}
                        </h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {tpl.description}
                        </p>
                      </div>

                      <span className="text-[10px] font-semibold text-[#0052FF] dark:text-[#00D2FF]">
                        {isSelected ? '✓ Seleccionada' : 'Ver modelo'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Vista Previa del Modelo */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Vista previa del contenido a insertar:
                </span>
                <pre className="text-[10px] font-mono leading-relaxed p-3 rounded-xl bg-slate-100 dark:bg-[#090A0F] border border-slate-200 dark:border-[#232A3B] text-slate-700 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {TEMPLATES.find((t) => t.id === previewTemplateId)?.content(companyName)}
                </pre>
              </div>
            </div>

            {/* Botones del Modal Pinned */}
            <div className="shrink-0 flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-slate-100 dark:border-[#232A3B] bg-slate-50/70 dark:bg-[#0E131F]">
              <button
                type="button"
                onClick={() => setSelectedTemplateModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleApplyTemplate(previewTemplateId)}
                className="px-4 py-2 rounded-xl bg-[#0052FF] hover:bg-[#0047E0] text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Insertar Esta Plantilla en el Asistente
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
