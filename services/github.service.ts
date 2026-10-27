import { TicketCategory, TicketPriority } from '@/lib/supabase/types';

interface CreateIssueInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  companyName: string;
  companyId: string;
  userFullName?: string;
  userEmail?: string;
  systemMetadata?: Record<string, any>;
  screenshotUrl?: string | null;
}

interface GitHubIssueResult {
  success: boolean;
  simulated?: boolean;
  issueNumber: number | null;
  issueUrl: string | null;
  error?: string;
}

const DEFAULT_REPO = 'JoseNieves00/Synqo--CRM';

export class GitHubService {
  private static getHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'Synqo-CRM-Support-Bot',
    };
  }

  private static getRepo(): { owner: string; repo: string } {
    const fullRepo = process.env.GITHUB_REPO_NAME || DEFAULT_REPO;
    const parts = fullRepo.split('/');
    if (parts.length === 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    return { owner: 'JoseNieves00', repo: 'Synqo--CRM' };
  }

  /**
   * Crea un Issue en GitHub de forma automática y resiliente.
   * Si no se ha configurado GITHUB_SUPPORT_TOKEN en variables de entorno,
   * no falla ni bloquea el CRM; registra el ticket en base de datos y simula la respuesta.
   */
  public static async createIssue(input: CreateIssueInput): Promise<GitHubIssueResult> {
    const token = process.env.GITHUB_SUPPORT_TOKEN || process.env.GITHUB_TOKEN;

    if (!token) {
      console.warn(
        '[GITHUB SERVICE] GITHUB_SUPPORT_TOKEN no configurado en variables de entorno. Ticket registrado localmente en Supabase.'
      );
      return {
        success: true,
        simulated: true,
        issueNumber: null,
        issueUrl: null,
      };
    }

    const { owner, repo } = this.getRepo();
    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

    // Asignación inteligente de etiquetas (labels)
    const labels: string[] = ['support-ticket'];
    if (input.category === 'bug') labels.push('bug');
    else if (input.category === 'feature_request') labels.push('enhancement');
    else labels.push(`area:${input.category}`);

    if (input.priority === 'critical' || input.priority === 'high') {
      labels.push('prioridad-alta');
    }

    // Formatear cuerpo Markdown estructurado
    const markdownBody = this.buildMarkdownBody(input);

    const formattedTitle = `[Ticket] [${input.category.toUpperCase()}] ${input.title.trim()}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(token),
        body: JSON.stringify({
          title: formattedTitle,
          body: markdownBody,
          labels,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        console.error('[GITHUB API ERROR]', response.status, errJson);
        return {
          success: false,
          issueNumber: null,
          issueUrl: null,
          error: errJson?.message || `Error ${response.status} de GitHub API`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        simulated: false,
        issueNumber: data.number,
        issueUrl: data.html_url,
      };
    } catch (err: any) {
      console.error('[GITHUB SERVICE EXCEPTION]', err);
      return {
        success: false,
        issueNumber: null,
        issueUrl: null,
        error: err.message || 'Excepción de red conectando con GitHub',
      };
    }
  }

  /**
   * Cierra un Issue en GitHub cuando el ticket se resuelve desde la consola de Super Admin.
   */
  public static async closeIssue(issueNumber: number, comment?: string): Promise<boolean> {
    const token = process.env.GITHUB_SUPPORT_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) return false;

    const { owner, repo } = this.getRepo();

    try {
      // 1. Agregar comentario de resolución si fue provisto
      if (comment) {
        await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
          method: 'POST',
          headers: this.getHeaders(token),
          body: JSON.stringify({
            body: `✅ **Ticket Resuelto en Synqo CRM:**\n${comment}`,
          }),
        }).catch(() => null);
      }

      // 2. Cerrar el Issue
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: 'PATCH',
        headers: this.getHeaders(token),
        body: JSON.stringify({ state: 'closed' }),
      });

      return response.ok;
    } catch (err) {
      console.error('[GITHUB CLOSE EXCEPTION]', err);
      return false;
    }
  }

  /**
   * Consulta el estado de un Issue para reconciliación pasiva.
   */
  public static async getIssueState(issueNumber: number): Promise<'open' | 'closed' | null> {
    const token = process.env.GITHUB_SUPPORT_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) return null;

    const { owner, repo } = this.getRepo();
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
        headers: this.getHeaders(token),
      });

      if (!response.ok) return null;
      const data = await response.json();
      return data.state === 'closed' ? 'closed' : 'open';
    } catch {
      return null;
    }
  }

  private static buildMarkdownBody(input: CreateIssueInput): string {
    const meta = input.systemMetadata || {};
    const lines = [
      `### 🎫 Reporte de Falla - Synqo CRM`,
      ``,
      `| Parámetro | Detalle |`,
      `| :--- | :--- |`,
      `| **Empresa** | **${input.companyName}** (\`${input.companyId}\`) |`,
      `| **Reportado por** | ${input.userFullName || 'Usuario'} (\`${input.userEmail || 'Sin email'}\`) |`,
      `| **Categoría** | \`${input.category}\` |`,
      `| **Prioridad** | **${input.priority.toUpperCase()}** |`,
      `| **Fecha (UTC)** | ${new Date().toISOString()} |`,
      ``,
      `#### 📝 Descripción del Problema:`,
      `> ${input.description.replace(/\n/g, '\n> ')}`,
      ``,
    ];

    if (input.screenshotUrl) {
      lines.push(
        `#### 📸 Captura de Pantalla Adjunta:`,
        `![Captura del Problema](${input.screenshotUrl})`,
        ``
      );
    }

    lines.push(
      `#### 🔍 Metadatos Técnicos del Entorno:`,
      `- **URL Origen:** \`${meta.currentUrl || 'No especificada'}\``,
      `- **Navegador / Plataforma:** \`${meta.userAgent || 'Desconocido'}\``,
      `- **Resolución:** \`${meta.screenResolution || 'N/A'}\``,
      `- **Estado WhatsApp:** \`${meta.isWhatsappConnected ? 'Conectado (Activo)' : 'Desconectado'}\``,
      `- **WABA Phone ID:** \`${meta.whatsappPhoneId || 'Sin configurar'}\``,
      ``,
      `---`,
      `*Reporte generado automáticamente desde Synqo CRM.*`
    );

    return lines.join('\n');
  }
}

