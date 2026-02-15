// Simple client-side Arma3 preset parser + set operations

function parsePreset(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const meta = doc.querySelector('meta[name="arma:PresetName"]');
  const presetName = meta ? meta.getAttribute('content') : 'Unnamed';
  const rows = Array.from(doc.querySelectorAll('tr[data-type="ModContainer"]'));
  const mods = rows.map(r => {
    const nameCell = r.querySelector('td[data-type="DisplayName"]');
    const link = r.querySelector('a[data-type="Link"]');
    const source = r.querySelector('span') ? r.querySelector('span').textContent : '';
    return {
      name: nameCell ? nameCell.textContent.trim() : '',
      source: source.trim(),
      link: link ? link.getAttribute('href') : ''
    };
  }).filter(m => m.name);
  return { presetName, mods, originalHtml: htmlString };
}

function uniqueByName(list) {
  const map = new Map();
  list.forEach(m => { if (!map.has(m.name)) map.set(m.name, m); });
  return Array.from(map.values());
}

function intersect(a, b) {
  const setB = new Set(b.map(m => m.name));
  return a.filter(m => setB.has(m.name));
}

function difference(a, b) {
  const setB = new Set(b.map(m => m.name));
  return a.filter(m => !setB.has(m.name));
}

function union(a, b) {
  return uniqueByName(a.concat(b));
}

function buildPresetHtml(templateHtml, mods, presetName) {
  const rows = mods.map(m => {
    const linkCell = m.link ? `<a href="${escapeHtml(m.link)}" data-type="Link">${escapeHtml(m.link)}</a>` : '';
    const sourceSpan = m.source ? `<span class="from-steam">${escapeHtml(m.source)}</span>` : '';
    return `        <tr data-type="ModContainer">\n          <td data-type="DisplayName">${escapeHtml(m.name)}</td>\n          <td>\n            ${sourceSpan}\n          </td>\n          <td>\n            ${linkCell}\n          </td>\n        </tr>\n`;
  }).join('');

  const tableReplaceRegex = /(<div[^>]*class=(?:"|')?[^>"']*mod-list[^>"']*(?:"|')?[^>]*>[\s\S]*?<table[^>]*>)([\s\S]*?)(<\/table>)/i;
  let out = templateHtml.replace(tableReplaceRegex, (m, g1, g2, g3) => {
    return g1 + '\n' + rows + '      ' + g3;
  });

  if (presetName) {
    out = out.replace(/(<meta\s+name=(?:"|')arma:PresetName(?:"|')\s+content=(?:"|'))([^"']*)(?:"|')/i, (m, g1) => g1 + escapeHtml(presetName) + '"');
    out = out.replace(/(<h1[\s\S]*?<strong>)([\s\S]*?)(<\/strong>[\s\S]*?<\/h1>)/i, (m, g1, g2, g3) => g1 + escapeHtml(presetName) + g3);
  }

  return out;
}

function escapeHtml(s) {
  return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// UI glue
const state = { presets: [] };

document.getElementById('files').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  state.presets = [];
  for (const f of files) {
    const txt = await f.text();
    const parsed = parsePreset(txt);
    state.presets.push({ fileName: f.name, ...parsed });
  }
  renderLoaded();
});

function renderLoaded() {
  const container = document.getElementById('loaded');
  container.innerHTML = '';
  state.presets.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'presetItem';
    div.innerHTML = `<label><input type="checkbox" data-idx="${i}" ${i<2? 'checked' : ''}> <strong>${escapeHtml(p.presetName || p.fileName)}</strong> — ${p.mods.length} mods</label>`;
    container.appendChild(div);
  });
}

document.getElementById('run').addEventListener('click', () => {
  const checked = Array.from(document.querySelectorAll('#loaded input[type=checkbox]:checked')).map(cb => parseInt(cb.dataset.idx));
  if (checked.length === 0) return alert('Select at least one preset.');
  const op = document.getElementById('op').value;
  // For binary ops we take first two selected presets (A and B)
  let resultMods = [];
  if (op === 'union') {
    const acc = [];
    checked.forEach(i => acc.push(...state.presets[i].mods));
    resultMods = uniqueByName(acc);
  } else if (op === 'intersection') {
    if (checked.length < 2) return alert('Intersection needs at least two presets selected.');
    resultMods = state.presets[checked[0]].mods;
    for (let k = 1; k < checked.length; k++) resultMods = intersect(resultMods, state.presets[checked[k]].mods);
  } else if (op === 'difference') {
    if (checked.length < 2) return alert('Difference needs two presets selected (A then B).');
    const A = state.presets[checked[0]].mods;
    const B = state.presets[checked[1]].mods;
    resultMods = difference(A, B);
  }

  state.result = { name: 'CombinedPreset', mods: resultMods, template: state.presets[checked[0]] ? state.presets[checked[0]].originalHtml : null };
  renderResult();
  document.getElementById('export').disabled = false;
});

function renderResult() {
  const meta = document.getElementById('resultMeta');
  const list = document.getElementById('resultList');
  if (!state.result) { meta.textContent = ''; list.innerHTML = ''; return; }
  meta.textContent = `${state.result.mods.length} mods in result (preset: ${state.result.name})`;
  list.innerHTML = `<ul>${state.result.mods.map(m => `<li>${escapeHtml(m.name)} ${m.link? `— <a href="${escapeHtml(m.link)}" target="_blank">link</a>`: ''}</li>`).join('')}</ul>`;
}

document.getElementById('export').addEventListener('click', () => {
  if (!state.result) return;
  const tpl = state.result.template || '';
  const html = buildPresetHtml(tpl, state.result.mods, state.result.name);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.result.name}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
