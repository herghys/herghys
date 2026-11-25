import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const DEFAULT_BASE_URL =
  process.env.SOURCE_BASE_URL ||
  'https://raw.githubusercontent.com/herghys/herghys.github.io/main';

const localFlagIndex = process.argv.indexOf('--local');
const LOCAL_SOURCE_DIR =
  localFlagIndex !== -1 && process.argv[localFlagIndex + 1]
    ? path.resolve(process.argv[localFlagIndex + 1])
    : null;

async function fetchSourceText(relativePath) {
  if (LOCAL_SOURCE_DIR) {
    return readFile(path.join(LOCAL_SOURCE_DIR, relativePath), 'utf8');
  }
  const url = `${DEFAULT_BASE_URL}/${relativePath}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'herghys-profile-sync' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&bull;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rarr;/g, '→')
    .replace(/&darr;/g, '↓')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseIndexHtml(html) {
  const statusMatch = html.match(
    /<div class="intro-status-pill">[\s\S]*?<span class="status-dot"><\/span>\s*<span>([\s\S]*?)<\/span>/i
  );
  const nameMatch = html.match(/<h1 class="intro-name">([\s\S]*?)<\/h1>/i);
  const subtitleMatch = html.match(
    /<div class="intro-subtitle">([\s\S]*?)<\/div>/i
  );

  const bioBlock = html.match(/<div class="intro-bio">([\s\S]*?)<\/div>/i);
  const bioParagraphs = [];
  if (bioBlock) {
    for (const m of bioBlock[1].matchAll(/<p>([\s\S]*?)<\/p>/gi)) {
      const text = stripTags(m[1]);
      if (text) bioParagraphs.push(text);
    }
  }

  const specs = [];
  for (const m of html.matchAll(
    /<div class="spec-item">\s*<span class="spec-val">([\s\S]*?)<\/span>\s*<span class="spec-lbl">([\s\S]*?)<\/span>\s*<\/div>/gi
  )) {
    specs.push({
      value: stripTags(m[1]),
      label: stripTags(m[2]),
    });
  }

  const wordLinkMatch = html.match(
    /<a[^>]+href="([^"]+)"[^>]*>\s*Word \(Google Docs\)\s*<\/a>/i
  );
  const pdfLinkMatch = html.match(
    /<a[^>]+href="([^"]+)"[^>]*>\s*PDF \(Drive\)\s*<\/a>/i
  );

  const contacts = [];
  const contactBlock = html.match(
    /<div class="contact-grid">([\s\S]*?)<\/div>/i
  );
  if (contactBlock) {
    for (const m of contactBlock[1].matchAll(
      /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>\s*<\/a>/gi
    )) {
      contacts.push({
        href: m[1].trim(),
        label: stripTags(m[2]),
      });
    }
  }

  return {
    status: statusMatch
      ? stripTags(statusMatch[1])
      : 'Unity Game Developer · Systems & Gameplay',
    name: nameMatch ? stripTags(nameMatch[1]) : 'Helmi Arghya Santosa',
    subtitle: subtitleMatch
      ? stripTags(subtitleMatch[1]).replace(/\s*·\s*/g, '  ·  ')
      : 'Unity Developer  ·  Software Engineer  ·  C# & .NET',
    bioParagraphs,
    specs,
    wordResumeUrl: wordLinkMatch ? wordLinkMatch[1] : null,
    pdfResumeUrl: pdfLinkMatch ? pdfLinkMatch[1] : null,
    contacts,
  };
}

function parseResumeMd(md) {
  const skills = [];
  const skillsSection = md.match(
    /### CORE COMPETENCIES & TECHNICAL SKILLS([\s\S]*?)(?:\n---|\n### )/i
  );
  if (skillsSection) {
    for (const line of skillsSection[1].split(/\r?\n/)) {
      const m = line.match(/^-\s+\*\*(.+?):\*\*\s+(.+)$/);
      if (m) {
        skills.push({ area: m[1].trim(), value: m[2].trim() });
      }
    }
  }

  const experience = [];
  const expSection = md.match(
    /### PROFESSIONAL EXPERIENCE([\s\S]*?)(?:\n---|\n### )/i
  );
  if (expSection) {
    const blocks = expSection[1].trim().split(/\r?\n\r?\n+/);
    for (const block of blocks) {
      const lines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 3) continue;
      const roleMatch = lines[0].match(/^\*\*(.+?)\*\*$/);
      const orgMatch = lines[1].match(/^\*(.+?)\*/);
      const periodMatch = lines[2].match(/^\*(.+?)\*$/);
      if (!roleMatch || !orgMatch || !periodMatch) continue;

      const bullets = lines
        .slice(3)
        .filter((l) => l.startsWith('- '))
        .map((l) => l.replace(/^-\s+/, '').trim());

      experience.push({
        role: roleMatch[1].trim(),
        organization: orgMatch[1].trim(),
        period: periodMatch[1].trim(),
        summary: bullets[0] || '',
      });
    }
  }

  return { skills, experience };
}

function renderHeroSvg({ status, name, subtitle, specs }) {
  const displaySpecs = specs.slice(0, 4);
  const pillWidth = Math.max(240, Math.min(360, Math.round(status.length * 6.8 + 44)));
  const pillX = 840 - pillWidth;
  const dotX = pillX + 18;
  const pillTextX = pillX + 30;

  const specCards = displaySpecs
    .map((spec, idx) => {
      const x = idx * 204;
      return [
        `    <rect x="${x}" y="0" width="188" height="72" rx="8" fill="#141724" stroke="#22283c"/>`,
        `    <text x="${x + 16}" y="32" class="sans" font-size="16" font-weight="700" fill="#f8fafc">${escapeXml(spec.value)}</text>`,
        `    <text x="${x + 16}" y="54" class="sans" font-size="12" font-weight="500" fill="#94a3b8">${escapeXml(spec.label)}</text>`,
      ].join('\n');
    })
    .join('\n\n');

  return `<svg width="880" height="296" viewBox="0 0 880 296" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(name)} (Herghys) — Unity Game Developer and Software Engineer">
  <title>${escapeXml(name)} (Herghys) — Unity Game Developer &amp; Software Engineer</title>
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
  <circle cx="${dotX}" cy="42" r="4" fill="#3b82f6"/>
  <text x="${pillTextX}" y="46" class="sans" font-size="12" font-weight="500" fill="#cbd5e1">${escapeXml(status)}</text>

  <line x1="40" y1="72" x2="840" y2="72" stroke="#1e2436" stroke-width="1"/>

  <text x="40" y="122" class="sans" font-size="34" font-weight="700" fill="#f8fafc" letter-spacing="-0.6">${escapeXml(name)}</text>
  <text x="40" y="152" class="sans" font-size="16" font-weight="500" fill="#94a3b8">${escapeXml(subtitle)}</text>

  <g transform="translate(40, 184)">
${specCards}
  </g>
</svg>
`;
}

function renderProjectCell(project) {
  const tech = (project.technologies || []).map(escapeHtml).join(' · ');
  return [
    '    <td width="50%" valign="top">',
    `      <strong><a href="${escapeHtml(project.link)}">${escapeHtml(project.title)}</a></strong> &nbsp;<code>${escapeHtml(project.badge || 'Project')}</code><br /><br />`,
    `      ${escapeHtml(project.description)}<br /><br />`,
    `      <sub>${tech}</sub>`,
    '    </td>',
  ].join('\n');
}

function renderFeaturedTable(projects) {
  const rows = [];
  for (let i = 0; i < projects.length; i += 2) {
    const left = renderProjectCell(projects[i]);
    const right = projects[i + 1]
      ? renderProjectCell(projects[i + 1])
      : '    <td width="50%" valign="top"></td>';
    rows.push(`  <tr>\n${left}\n${right}\n  </tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

function formatContactLine(contact) {
  const href = contact.href;
  if (href.startsWith('mailto:')) {
    return `- **Email:** [${contact.label}](${href})`;
  }
  if (href.includes('wa.me')) {
    return `- **WhatsApp:** [${contact.label}](${href})`;
  }
  if (href.includes('linkedin.com')) {
    return `- **LinkedIn:** [linkedin.com/in/herghys](${href})`;
  }
  if (href.includes('steamcommunity.com')) {
    return `- **Steam:** [steamcommunity.com/id/herghys](${href})`;
  }
  if (href.includes('github.com/herghys')) {
    return null;
  }
  return `- **${contact.label}:** [${contact.label}](${href})`;
}

function renderReadme({
  site,
  featuredProjects,
  projectsCount,
  experience,
  skills,
}) {
  const bio = site.bioParagraphs.join('\n\n');
  const featuredTable = renderFeaturedTable(featuredProjects);

  const visibleExperience = experience.slice(0, 5);
  const experienceRows = visibleExperience
    .map(
      (exp) =>
        `| **${exp.role}** | ${exp.organization} | ${exp.period} | ${exp.summary.replace(/\|/g, '\\|')} |`
    )
    .join('\n');

  const resumeLinks = [
    '[View Full Resume](https://herghys.github.io/resume/)',
    '[Print View](https://herghys.github.io/resume/print.html)',
  ];
  if (site.pdfResumeUrl) {
    resumeLinks.push(`[PDF (Drive)](${site.pdfResumeUrl})`);
  }
  if (site.wordResumeUrl) {
    resumeLinks.push(`[Word (Google Docs)](${site.wordResumeUrl})`);
  }

  const skillRows = skills
    .map((s) => `| **${s.area}** | ${s.value.replace(/\|/g, '\\|')} |`)
    .join('\n');

  const contactLines = site.contacts.map(formatContactLine).filter(Boolean);
  contactLines.splice(
    Math.min(3, contactLines.length),
    0,
    '- **Portfolio:** [herghys.github.io](https://herghys.github.io/)'
  );

  return `<!-- Auto-synced from herghys.github.io via scripts/sync-profile.mjs -->
<p align="center">
  <a href="https://herghys.github.io/">
    <img src="assets/hero-banner.svg" alt="${escapeHtml(site.name)} (Herghys) — Unity Game Developer & Software Engineer" width="100%" />
  </a>
</p>

<p align="center">
  <a href="https://herghys.github.io/portfolio/"><img src="https://img.shields.io/badge/Portfolios-${projectsCount}%20Projects-3b82f6?style=flat-square&labelColor=141724" alt="Portfolios" /></a>
  <a href="https://herghys.github.io/resume/"><img src="https://img.shields.io/badge/Resume-Online-141724?style=flat-square&labelColor=1e2436" alt="Resume" /></a>
  <a href="https://herghys.github.io/"><img src="https://img.shields.io/badge/Website-herghys.github.io-141724?style=flat-square&labelColor=1e2436" alt="Website" /></a>
  <a href="https://www.linkedin.com/in/herghys"><img src="https://img.shields.io/badge/LinkedIn-herghys-141724?style=flat-square&logo=linkedin&logoColor=3b82f6&labelColor=1e2436" alt="LinkedIn" /></a>
  <a href="https://play.google.com/store/apps/developer?id=Herghys+Studio"><img src="https://img.shields.io/badge/Google%20Play-Herghys%20Studio-141724?style=flat-square&logo=google-play&logoColor=3b82f6&labelColor=1e2436" alt="Google Play" /></a>
</p>

---

### About

${bio}

---

### Featured Projects

Selected commercial games, web platforms, and software tools — [browse all ${projectsCount} projects →](https://herghys.github.io/portfolio/)

${featuredTable}

---

### Experience & Credentials

| Role | Organization | Period | Highlights |
| :--- | :--- | :--- | :--- |
${experienceRows}

Full history, education, and credentials: ${resumeLinks.join(' · ')}

---

### Technical Stack

| Area | Technologies |
| :--- | :--- |
${skillRows}

---

### GitHub Activity

<p align="center">
  <img src="https://github-readme-stats.vercel.app/api?username=herghys&show_icons=true&include_all_commits=true&rank_icon=github&bg_color=141724&title_color=f8fafc&text_color=cbd5e1&icon_color=3b82f6&border_color=22283c&border_radius=8" alt="Herghys GitHub Stats" height="172" />
  <img src="https://github-readme-stats.vercel.app/api/top-langs?username=herghys&layout=compact&langs_count=8&bg_color=141724&title_color=f8fafc&text_color=cbd5e1&border_color=22283c&border_radius=8" alt="Herghys Top Languages" height="172" />
</p>

---

### Connect

Get in touch for game engineering, collaboration, or inquiries:

${contactLines.join('\n')}
`;
}

async function main() {
  const [indexHtml, featuredRaw, portfolioRaw, resumeMd] = await Promise.all([
    fetchSourceText('index.html'),
    fetchSourceText('data/featured.json'),
    fetchSourceText('portfolio/data/portfolio.json'),
    fetchSourceText('resume/Resume.md'),
  ]);

  const site = parseIndexHtml(indexHtml);
  const featuredProjects = JSON.parse(featuredRaw);
  const portfolio = JSON.parse(portfolioRaw);
  const { skills, experience } = parseResumeMd(resumeMd);

  const projectsCount = Array.isArray(portfolio) ? portfolio.length : 32;

  // Keep the shipped projects spec in sync with portfolio.json count
  const syncedSpecs = site.specs.map((spec) =>
    /projects/i.test(spec.label)
      ? { ...spec, value: String(projectsCount) }
      : spec
  );

  const svg = renderHeroSvg({
    status: site.status,
    name: site.name,
    subtitle: site.subtitle,
    specs: syncedSpecs,
  });

  const readme = renderReadme({
    site,
    featuredProjects,
    projectsCount,
    experience,
    skills,
  });

  await mkdir(path.join(ROOT_DIR, 'assets'), { recursive: true });
  await Promise.all([
    writeFile(path.join(ROOT_DIR, 'assets', 'hero-banner.svg'), svg, 'utf8'),
    writeFile(path.join(ROOT_DIR, 'README.md'), readme, 'utf8'),
  ]);

  console.log(
    `Synced profile from ${LOCAL_SOURCE_DIR || DEFAULT_BASE_URL}: ${projectsCount} total projects, ${featuredProjects.length} featured, ${experience.length} roles, ${skills.length} skill groups.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
