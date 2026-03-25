(() => {
  const DATA = window.IFR_APP_DATA || { meta: {}, topics: [], guides: [] };
  const GUIDE_ORDER = Object.fromEntries((DATA.guides || []).map((guide, index) => [guide.id, index]));
  const GUIDES = DATA.guides || [];
  const TOPICS = DATA.topics || [];
  const STATE = { view: 'inicio', guide: 'all', topic: 'all', query: '' };
  const PANELS = {};

  const EXERCISES = GUIDES.flatMap((guide) =>
    (guide.exercises || []).map((exercise) => ({
      ...exercise,
      guideOrder: GUIDE_ORDER[guide.id] || 0,
      searchIndex: normalizeText([
        exercise.guideName,
        exercise.number,
        exercise.topic,
        exercise.question,
        exercise.whatToSolve,
        exercise.hint,
        ...(exercise.options || []).map((option) => option.text),
        ...(exercise.optionsAnalysis || []).map((item) => item.text)
      ].join(' '))
    }))
  );

  const VIEWS = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'guia-1', label: 'Guía 1' },
    { id: 'guia-2', label: 'Guía 2' },
    { id: 'temas', label: 'Temas' },
    { id: 'todos', label: 'Todos los reactivos' }
  ];

  const GUIDE_TEXT = {
    'guia-1': 'Primera guía con reactivos del 41 al 52 y cuatro opciones por ejercicio.',
    'guia-2': 'Segunda guía con reactivos del 41 al 52 y cinco opciones por ejercicio.'
  };

  const byId = (id) => document.getElementById(id);

  function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function paragraphs(text) {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    return blocks.length
      ? `<div class="text">${blocks
          .map((block) => block.split('\n').map((line) => `<p>${esc(line)}</p>`).join(''))
          .join('')}</div>`
      : '';
  }

  function question(lines) {
    return `<div class="question">${(Array.isArray(lines) ? lines : [])
      .filter(Boolean)
      .map((line) => `<p>${esc(line)}</p>`)
      .join('')}</div>`;
  }

  function currentGuide() {
    return STATE.view === 'guia-1' ? 'guia-1' : STATE.view === 'guia-2' ? 'guia-2' : STATE.guide;
  }

  function matches() {
    const guide = currentGuide();
    const topic = STATE.topic;
    const query = normalizeText(STATE.query.trim());
    return EXERCISES.filter((exercise) => {
      if (guide !== 'all' && exercise.guideId !== guide) return false;
      if (topic !== 'all' && exercise.topicId !== topic) return false;
      if (query && !exercise.searchIndex.includes(query)) return false;
      return true;
    }).sort((left, right) =>
      left.guideOrder !== right.guideOrder
        ? left.guideOrder - right.guideOrder
        : left.sourceOrder - right.sourceOrder
    );
  }

  function distinct(exercises, field) {
    return new Set(exercises.map((exercise) => exercise[field])).size;
  }

  function chip(label, active, action, data = {}) {
    const attrs = Object.entries(data)
      .map(([key, value]) => ` ${key}="${esc(value)}"`)
      .join('');
    return `<button class="chip${active ? ' active' : ''}" type="button" data-action="${esc(action)}"${attrs}>${esc(label)}</button>`;
  }

  function isOpen(exerciseId, panel) {
    return !!(PANELS[exerciseId] && PANELS[exerciseId][panel]);
  }

  function panelButton(exerciseId, panel, label) {
    const open = isOpen(exerciseId, panel);
    return `<button class="action${open ? ' open' : ''}" type="button" data-action="toggle-panel" data-id="${esc(exerciseId)}" data-panel="${esc(panel)}">${esc(open ? `Ocultar ${label.toLowerCase()}` : label)}</button>`;
  }

  function optionList(options) {
    return `<ul class="options">${(options || [])
      .map((option) => `<li><span class="badge">${esc(option.label)}</span><div>${esc(option.text)}</div></li>`)
      .join('')}</ul>`;
  }

  function analysisList(exercise) {
    const items = (exercise.optionsAnalysis || []).filter((item) => item.text);
    return items.length
      ? `<div class="analysis-list">${items
          .map(
            (item) =>
              `<article class="analysis"><div class="analysis-head"><span class="badge">${esc(item.label)}</span><span>${esc(item.option || `Opción ${item.label}`)}</span></div>${paragraphs(item.text)}</article>`
          )
          .join('')}</div>`
      : '';
  }

  function card(exercise) {
    return `<article class="card" id="reactivo-${esc(exercise.id)}">
      <span class="eyebrow">${esc(`${exercise.guideName} · Reactivo ${exercise.number}`)}</span>
      <h3>${esc(exercise.topic)}</h3>
      <div class="card-grid">
        <div class="block"><div class="meta">Pregunta</div>${question(exercise.questionLines)}</div>
        <div class="block"><div class="meta">Opciones</div>${optionList(exercise.options)}</div>
      </div>
      <div class="actions">
        ${panelButton(exercise.id, 'what', 'Ver qué pide')}
        ${panelButton(exercise.id, 'analysis', 'Analizar opciones')}
        ${panelButton(exercise.id, 'hint', 'Ver pista')}
      </div>
      <section class="support"${isOpen(exercise.id, 'what') ? '' : ' hidden'}><div class="meta">Qué pide</div>${paragraphs(exercise.whatToSolve)}</section>
      <section class="support"${isOpen(exercise.id, 'analysis') ? '' : ' hidden'}><div class="meta">Análisis de opciones</div>${analysisList(exercise)}</section>
      <section class="support hint"${isOpen(exercise.id, 'hint') ? '' : ' hidden'}><div class="meta">Pista</div>${paragraphs(exercise.hint)}</section>
    </article>`;
  }

  function guideSection(guide, exercises) {
    if (!exercises.length) return '';
    return `<section class="section"><header class="section-head"><div><h2>${esc(guide.name)}</h2><p>${esc(GUIDE_TEXT[guide.id] || 'Consulta los reactivos de esta guía sin alterar su secuencia original.')}</p></div><span class="count">${esc(String(exercises.length))} reactivos</span></header><div class="cards">${exercises.map(card).join('')}</div></section>`;
  }

  function topicSection(topic, exercises) {
    const byGuide = new Map();
    exercises.forEach((exercise) => {
      if (!byGuide.has(exercise.guideId)) byGuide.set(exercise.guideId, []);
      byGuide.get(exercise.guideId).push(exercise);
    });
    const splits = Array.from(byGuide.entries())
      .sort((left, right) => (GUIDE_ORDER[left[0]] || 0) - (GUIDE_ORDER[right[0]] || 0))
      .map(([guideId, items]) => {
        const guide = GUIDES.find((entry) => entry.id === guideId);
        return `<div class="guide-split"><div class="guide-split-head"><h3>${esc(guide ? guide.name : guideId)}</h3><span>${esc(`${items.length} reactivos en su orden original`)}</span></div><div class="cards">${items.map(card).join('')}</div></div>`;
      })
      .join('');
    return `<section class="section"><header class="section-head"><div><h2>${esc(topic.name)}</h2><p>Los reactivos aparecen agrupados por guía y respetan la secuencia de origen dentro de cada una.</p></div><span class="count">${esc(String(exercises.length))} reactivos</span></header>${splits}</section>`;
  }

  function home() {
    const guideCards = GUIDES.map((guide) => {
      const first = guide.exercises[0];
      const last = guide.exercises[guide.exercises.length - 1];
      return `<article class="info-card"><h3>${esc(guide.name)}</h3><p>${esc(GUIDE_TEXT[guide.id] || '')}</p><p>${esc(`${guide.exerciseCount} reactivos · orden ${first.number} a ${last.number}`)}</p><button class="secondary" type="button" data-action="view" data-view="${esc(guide.id)}">Entrar a ${esc(guide.name)}</button></article>`;
    }).join('');
    const topicButtons = TOPICS.map((topic) => `<button type="button" data-action="topic" data-topic="${esc(topic.id)}">${esc(`${topic.name} (${topic.exerciseCount})`)}</button>`).join('');
    const previews = GUIDES.map((guide) => guideSection(guide, guide.exercises.slice(0, 2))).join('');
    return `<section class="panel"><h2>Ruta de estudio sugerida</h2><p>Empieza por una guía si quieres seguir la secuencia original completa. Entra a «Temas» si prefieres localizar contenidos específicos sin romper el orden interno de cada guía. Usa la búsqueda para ubicar conceptos o reactivos concretos.</p><div class="hero-grid">${guideCards}</div></section><section class="panel"><h2>Temas disponibles</h2><p>La clasificación temática se toma directamente del material fuente. Sirve para consultar mejor, pero no altera la fidelidad de los reactivos.</p><div class="quick-topics">${topicButtons}</div></section>${previews}`;
  }

  function empty() {
    return `<section class="empty"><h2>No hay reactivos con ese filtro.</h2><p>Ajusta la búsqueda, cambia el tema o vuelve a una vista más amplia.</p></section>`;
  }

  function renderPresetNav() {
    return VIEWS.map((view) => chip(view.label, STATE.view === view.id, 'view', { 'data-view': view.id })).join('');
  }

  function renderGuideChips() {
    return [
      chip('Todas las guías', currentGuide() === 'all' && !['guia-1', 'guia-2'].includes(STATE.view), 'guide', { 'data-guide': 'all' }),
      ...GUIDES.map((guide) => chip(guide.name, currentGuide() === guide.id, 'guide', { 'data-guide': guide.id }))
    ].join('');
  }

  function renderTopicChips(list) {
    const visibleTopics =
      STATE.view === 'inicio'
        ? TOPICS
        : TOPICS.filter((topic) => list.some((exercise) => exercise.topicId === topic.id) || STATE.topic === topic.id);
    return [
      chip('Todos los temas', STATE.topic === 'all', 'topic', { 'data-topic': 'all' }),
      ...visibleTopics.map((topic) => chip(`${topic.name} (${topic.exerciseCount})`, STATE.topic === topic.id, 'topic', { 'data-topic': topic.id }))
    ].join('');
  }

  function renderMetrics(list) {
    return [
      { value: list.length, label: 'Reactivos visibles' },
      { value: distinct(list, 'guideId'), label: 'Guías representadas' },
      { value: distinct(list, 'topicId'), label: 'Temas activos' }
    ].map((item) => `<div class="sum"><b>${esc(String(item.value))}</b><span>${esc(item.label)}</span></div>`).join('');
  }

  function render() {
    const list = matches();
    byId('topStats').textContent = `${list.length} visibles · ${distinct(list, 'topicId')} temas · consulta sin respuestas explícitas`;
    byId('presetNav').innerHTML = renderPresetNav();
    byId('guideChips').innerHTML = renderGuideChips();
    byId('topicChips').innerHTML = renderTopicChips(list);
    byId('metrics').innerHTML = renderMetrics(list);

    if (STATE.view === 'inicio') {
      byId('content').innerHTML = home();
      byId('empty').hidden = true;
      return;
    }

    if (!list.length) {
      byId('content').innerHTML = '';
      byId('empty').hidden = false;
      return;
    }

    byId('empty').hidden = true;

    if (STATE.view === 'temas') {
      const grouped = new Map();
      list.forEach((exercise) => {
        if (!grouped.has(exercise.topicId)) grouped.set(exercise.topicId, []);
        grouped.get(exercise.topicId).push(exercise);
      });
      byId('content').innerHTML = TOPICS.filter((topic) => grouped.has(topic.id))
        .map((topic) => topicSection(topic, grouped.get(topic.id)))
        .join('');
      return;
    }

    byId('content').innerHTML =
      GUIDES.map((guide) => guideSection(guide, list.filter((exercise) => exercise.guideId === guide.id))).join('') ||
      empty();
  }

  document.addEventListener('click', (event) => {
    const node = event.target.closest('[data-action]');
    if (!node) return;
    const action = node.dataset.action;
    if (action === 'view') {
      STATE.view = node.dataset.view || 'inicio';
      if (STATE.view === 'guia-1') STATE.guide = 'guia-1';
      if (STATE.view === 'guia-2') STATE.guide = 'guia-2';
      if (STATE.view === 'inicio') {
        STATE.guide = 'all';
        STATE.topic = 'all';
      }
      render();
      return;
    }
    if (action === 'guide') {
      STATE.guide = node.dataset.guide || 'all';
      if (STATE.guide === 'guia-1' || STATE.guide === 'guia-2') STATE.view = STATE.guide;
      else if (STATE.view === 'guia-1' || STATE.view === 'guia-2') STATE.view = 'todos';
      if (STATE.view === 'inicio') STATE.view = 'todos';
      render();
      return;
    }
    if (action === 'topic') {
      STATE.topic = node.dataset.topic || 'all';
      if (STATE.view === 'inicio') STATE.view = 'temas';
      render();
      return;
    }
    if (action === 'toggle-panel') {
      const exerciseId = node.dataset.id;
      const panel = node.dataset.panel;
      const panelOrder = { what: 0, analysis: 1, hint: 2 };
      if (!PANELS[exerciseId]) PANELS[exerciseId] = {};
      const nextState = !PANELS[exerciseId][panel];
      PANELS[exerciseId][panel] = nextState;
      render();
      if (nextState) {
        window.requestAnimationFrame(() => {
          const cardNode = document.getElementById(`reactivo-${exerciseId}`);
          const supportNode = cardNode?.querySelectorAll('.support')[panelOrder[panel] ?? 0];
          if (supportNode && !supportNode.hasAttribute('hidden')) {
            supportNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      }
    }
  });

  byId('searchInput').addEventListener('input', (event) => {
    STATE.query = event.target.value || '';
    if (STATE.view === 'inicio' && STATE.query.trim()) STATE.view = 'todos';
    render();
  });

  window.applyPreset = (preset) => {
    STATE.view = preset;
    if (preset === 'guia-1' || preset === 'guia-2') STATE.guide = preset;
    if (preset === 'temas') STATE.guide = 'all';
    if (preset === 'todos') STATE.guide = 'all';
    render();
    byId('content').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toTop = byId('toTop');
  const syncTop = () => toTop.classList.toggle('show', window.scrollY > 260);
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', syncTop, { passive: true });
  window.addEventListener('load', syncTop);

  render();
  syncTop();
})();
