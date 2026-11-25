import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const BASE_URL = (process.env.SITE_URL || 'https://herghys.github.io').replace(/\/+$/, '');
const SOURCE_DIR = process.env.SOURCE_DIR ? resolve(process.env.SOURCE_DIR) : null;

async function fetchSource(relPath) {
  if (SOURCE_DIR) {
    return readFile(join(SOURCE_DIR, relPath), 'utf8');
  }
  const url = `${BASE_URL}/${relPath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url} (${res.status})`);
  }
  return res.text();
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&bull;/g, '·')
    .replace(/&mdash;/g, '—')
    .replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return escapeXml(str);
}

function parseIndexHtml(html) {
  const matchOne = (regex, fallback = '') => {
    const m = html.match(regex);
    return m ? decodeHtml(m[1]) : fallback;
  };

  const name = matchOne(/<h1[^>]*class="intro-name"[^>]*>([\s\S]*?)<\/h1>/i, 'Helmi Arghya Santosa');
  const subtitle = matchOne(/<div[^>]*class="intro-subtitle"[^>]*>([\s\S]*?)<\/div>/i, 'Unity Developer · Software Engineer · C# & .NET');

  const statusBlock = html.match(/<div[^>]*class="intro-status-pill"[^>]*>([\s\S]*?)<\/div>/i);
  const status = statusBlock ? decodeHtml(statusBlock[1]) : 'Unity Game Developer · Systems & Gameplay';

  const bioBlock = html.match(/<div[^>]*class="intro-bio"[^>]*>([\s\S]*?)<\/div>/i);
  const bio = bioBlock
    ? [...bioBlock[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decodeHtml(m[1])).filter(Boolean)
    : [];

  const specs = [...html.matchAll(/<div[^>]*class="spec-item"[^>]*>[\s\S]*?<span[^>]*class="spec-val"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<span[^>]*class="spec-lbl"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/div>/gi)].map(
    (m) => ({ value: decodeHtml(m[1]), label: decodeHtml(m[2]) })
  );

  const wordLink = html.match(/href="(https:\/\/docs\.google\.com\/document\/[^"]+)"/i)?.[1] || '';
  const pdfLink = html.match(/href="(https:\/\/drive\.google\.com\/file\/[^"]+)"/i)?.[1] || '';

  const contacts = [...html.matchAll(/<a[^>]*class="contact-link-card"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<\/a>/gi)].map(
    (m) => ({ href: m[1].trim(), label: decodeHtml(m[2]) })
  );

  return { name, subtitle, status, bio, specs, wordLink, pdfLink, contacts };
}

function parseResumeMd(md) {
  const skillsSection = md.match(/###\s+CORE COMPETENCIES & TECHNICAL SKILLS([\s\S]*?)(?=\n---|\n###\s)/i)?.[1] || '';
  const techStack = [...skillsSection.matchAll(/^-\s+\*\*(.+?):\*\*\s+(.+)$/gm)].map((m) => ({
    area: m[1].trim(),
    items: m[2].trim(),
  }));

  const expSection = md.match(/###\s+PROFESSIONAL EXPERIENCE([\s\S]*?)(?=\n---|\n###\s)/i)?.[1] || '';
  const blocks = expSection.split(/\n(?=\*\*[^*\n]+\*\*\s*\n\*)/).map((b) => b.trim()).filter(Boolean);

  const experience = blocks.slice(0, 5).map((block) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const role = (lines[0] || '').replace(/^\*\*|\*\*$/g, '').trim();
    const orgLine = (lines[1] || '').split('|')[0].replace(/^\*|\*$/g, '').trim();
    const period = (lines[2] || '').replace(/^\*|\*$/g, '').trim();
    const firstBullet = (lines.find((l) => l.startsWith('- ')) || '').replace(/^-\s+/, '').trim();
    return { role, org: orgLine, period, focus: firstBullet };
  }).filter((e) => e.role && e.org);

  return { techStack, experience };
}

function buildHeroSvg({ name, subtitle, status, specs }) {
  const fourSpecs = specs.slice(0, 4);
  const pillWidth = Math.max(264, Math.min(360, status.length * 7 + 44));
  const pillX = 840 - pillWidth;

  const specCards = fourSpecs.map((spec, i) => {
    const x = i * 204;
    return `    <rect x="${x}" y="0" width="188" height="72" rx="8" fill="#141724" stroke="#22283c"/>
    <text x="${x + 16}" y="32" class="sans" font-size="16" font-weight="700" fill="#f8fafc">${escapeXml(spec.value)}</text>
    <text x="${x + 16}" y="54" class="sans" font-size="12" font-weight="500" fill="#94a3b8">${escapeXml(spec.label)}</text>`;
  }).join('\n\n');

  return `<svg width="880" height="296" viewBox="0 0 880 296" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(name)} (Herghys) — ${escapeXml(subtitle)}">
  <title>${escapeXml(name)} (Herghys) — ${escapeXml(subtitle)}</title>
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="880" y2="296" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0b0d13"/>
      <stop offset="100%" stop-color="#11141f"/>
    </linearGradient>
    <radialGradient id="subtle-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(760 48) rotate(135) scale(340 220)">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
    <style>
      .sans { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    </style>
  </defs>

  <rect x="0.5" y="0.5" width="879" height="295" rx="12" fill="url(#bg-grad)" stroke="#23293d"/>
  <rect x="0.5" y="0.5" width="879" height="295" rx="12" fill="url(#subtle-glow)"/>

  <text x="40" y="48" class="mono" font-size="16" font-weight="700" fill="#f8fafc" letter-spacing="-0.3">herghys<tspan fill="#3b82f6">.</tspan></text>

  <rect x="${pillX}" y="28" width="${pillWidth}" height="28" rx="14" fill="#141724" stroke="#233252"/>
  <circle cx="${pillX + 18}" cy="42" r="4" fill="#3b82f6"/>
  <text x="${pillX + 30}" y="46" class="sans" font-size="12" font-weight="500" fill="#cbd5e1">${escapeXml(status)}</text>

  <line x1="40" y1="72" x2="840" y2="72" stroke="#1e2436" stroke-width="1"/>

  <text x="40" y="122" class="sans" font-size="34" font-weight="700" fill="#f8fafc" letter-spacing="-0.6">${escapeXml(name)}</text>
  <text x="40" y="152" class="sans" font-size="16" font-weight="500" fill="#94a3b8">${escapeXml(subtitle.replace(/\s*·\s*/g, '  ·  '))}</text>

  <g transform="translate(40, 184)">
${specCards}
  </g>
</svg>
`;
}

function buildFeaturedTable(featured) {
  const rows = [];
  for (let i = 0; i < featured.length; i += 2) {
    const pair = featured.slice(i, i + 2);
    const cells = pair.map((item) => {
      const tech = (item.technologies || []).join(' · ');
      const title = item.link
        ? `<a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      return `    <td width="50%" valign="top">
      <strong>${title}</strong> &nbsp;<code>${escapeHtml(item.badge || 'Project')}</code><br /><br />
      ${escapeHtml(item.description)}<br /><br />
      <sub>${escapeHtml(tech)}</sub>
    </td>`;
    });
    if (cells.length === 1) {
      cells.push('    <td width="50%"></td>');
    }
    rows.push(`  <tr>\n${cells.join('\n')}\n  </tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

function buildContactsList(contacts) {
  const mapped = [];
  for (const c of contacts) {
    if (c.href.startsWith('mailto:')) {
      mapped.push(`- **Email:** [${c.label}](${c.href})`);
    } else if (c.href.includes('wa.me')) {
      mapped.push(`- **WhatsApp:** [${c.label}](${c.href})`);
    } else if (c.href.includes('linkedin.com')) {
      mapped.push(`- **LinkedIn:** [${c.href.replace(/^https?:\/\/(www\.)?/, '')}](${c.href})`);
    } else if (c.href.includes('steamcommunity.com')) {
      mapped.push(`- **Steam:** [${c.href.replace(/^https?:\/\/(www\.)?/, '')}](${c.href})`);
    }
  }
  mapped.splice(3, 0, `- **Portfolio:** [herghys.github.io](${BASE_URL}/)`);
  return mapped.join('\n');
}

function buildReadme({ site, featured, projectCount, resume }) {
  const resumeLinks = [
    `[View Full Resume](${BASE_URL}/resume/)`,
    `[Print View](${BASE_URL}/resume/print.html)`,
    site.pdfLink ? `[PDF (Drive)](${site.pdfLink})` : '',
    site.wordLink ? `[Word (Google Docs)](${site.wordLink})` : '',
  ].filter(Boolean).join(' · ');

  const expRows = resume.experience
    .map((e) => `| **${e.role}** | ${e.org} | ${e.period} | ${e.focus.replace(/\|/g, '\\|')} |`)
    .join('\n');

  const stackRows = resume.techStack
    .map((s) => `| **${s.area}** | ${s.items.replace(/\|/g, '\\|')} |`)
    .join('\n');

  return `<p align="center">
  <a href="${BASE_URL}/">
    <img src="assets/hero-banner.svg" alt="${escapeHtml(site.name)} (Herghys) — ${escapeHtml(site.subtitle)}" width="100%" />
  </a>
</p>

<p align="center">
  <a href="${BASE_URL}/portfolio/"><img src="https://img.shields.io/badge/Portfolios-${projectCount}%20Projects-3b82f6?style=flat-square&labelColor=141724" alt="Portfolios" /></a>
  <a href="${BASE_URL}/resume/"><img src="https://img.shields.io/badge/Resume-Online-141724?style=flat-square&labelColor=1e2436" alt="Resume" /></a>
  <a href="${BASE_URL}/"><img src="https://img.shields.io/badge/Website-herghys.github.io-141724?style=flat-square&labelColor=1e2436" alt="Website" /></a>
  <a href="https://www.linkedin.com/in/herghys"><img src="https://img.shields.io/badge/LinkedIn-herghys-141724?style=flat-square&logo=linkedin&logoColor=3b82f6&labelColor=1e2436" alt="LinkedIn" /></a>
  <a href="https://play.google.com/store/apps/developer?id=Herghys+Studio"><img src="https://img.shields.io/badge/Google%20Play-Herghys%20Studio-141724?style=flat-square&logo=google-play&logoColor=3b82f6&labelColor=1e2436" alt="Google Play" /></a>
</p>

---

### About

${site.bio.join('\n\n')}

---

### Featured Projects

Selected commercial games, web platforms, and software tools — [browse all ${projectCount} projects →](${BASE_URL}/portfolio/)

${buildFeaturedTable(featured)}

---

### Experience & Credentials

| Role | Organization | Period | Focus |
| :--- | :--- | :--- | :--- |
${expRows}

Full history, education, and credentials: ${resumeLinks}

---

### Technical Stack

| Area | Technologies |
| :--- | :--- |
${stackRows}

---

### GitHub Activity

<p align="center">
  <img src="https://github-readme-stats.vercel.app/api?username=herghys&show_icons=true&include_all_commits=true&rank_icon=github&bg_color=141724&title_color=f8fafc&text_color=cbd5e1&icon_color=3b82f6&border_color=22283c&border_radius=8" alt="Herghys GitHub Stats" height="172" />
  <img src="https://github-readme-stats.vercel.app/api/top-langs?username=herghys&layout=compact&langs_count=8&bg_color=141724&title_color=f8fafc&text_color=cbd5e1&border_color=22283c&border_radius=8" alt="Herghys Top Languages" height="172" />
</p>

---

### Connect

Get in touch for game engineering, collaboration, or inquiries:

${buildContactsList(site.contacts)}
`;
}

async function main() {
  const [indexHtml, featuredRaw, portfolioRaw, resumeMd] = await Promise.all([
    fetchSource('index.html'),
    fetchSource('data/featured.json'),
    fetchSource('portfolio/data/portfolio.json'),
    fetchSource('resume/Resume.md'),
  ]);

  const site = parseIndexHtml(indexHtml);
  const featured = JSON.parse(featuredRaw);
  const portfolio = JSON.parse(portfolioRaw);
  const resume = parseResumeMd(resumeMd);
  const projectCount = Array.isArray(portfolio) && portfolio.length > 0 ? portfolio.length : 32;

  const projectSpec = site.specs.find((s) => /project/i.test(s.label));
  if (projectSpec) {
    projectSpec.value = String(projectCount);
  }

  const svg = buildHeroSvg(site);
  const readme = buildReadme({ site, featured, projectCount, resume });

  await mkdir(join(ROOT_DIR, 'assets'), { recursive: true });
  await writeFile(join(ROOT_DIR, 'assets', 'hero-banner.svg'), svg, 'utf8');
  await writeFile(join(ROOT_DIR, 'README.md'), readme, 'utf8');

  console.log(`Synced profile from ${SOURCE_DIR || BASE_URL} (${projectCount} projects, ${featured.length} featured, ${resume.experience.length} roles).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
