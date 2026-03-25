(() => {
  const DATA = window.IFR_APP_DATA || { meta: {}, topics: [], guides: [] };
  const GUIDES = DATA.guides || [];
  const TOPICS = DATA.topics || [];
  const GUIDE_ORDER = Object.fromEntries(GUIDES.map((guide, index) => [guide.id, index]));
  const STATE = { view: 'inicio', guide: 'all', topic: 'all', query: '' };
  const PANELS = {};
  const SELECTIONS = {};

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
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const EXERCISES = GUIDES.flatMap((guide) =>
    (guide.exercises || []).map((exercise) => ({
      ...exercise,
      guideOrder: GUIDE_ORDER[guide.id] || 0,
      searchIndex: normalizeText([
        exercise.guideName,
        exercise.number,
        exercise.topic,
        exercise.question,
        exercise.hint,
        ...(exercise.options || []).map((option) => option.text)
      ].join(' '))
    }))
  );

  function paragraphs(text) {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (!blocks.length) return '';

    return `<div class="text">${blocks
      .map((block) => block.split('\n').map((line) => `<p>${esc(line)}</p>`).join(''))
      .join('')}</div>`;
  }

  function question(lines) {
    return `<div class="question">${(Array.isArray(lines) ? lines : [])
      .filter(Boolean)
      .map((line) => `<p>${esc(line)}</p>`)
      .join('')}</div>`;
  }

  function currentGuide() {
    if (STATE.view === 'guia-1') return 'guia-1';
    if (STATE.view === 'guia-2') return 'guia-2';
    return STATE.guide;
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
    }).sort((left, right) => {
      if (left.guideOrder !== right.guideOrder) return left.guideOrder - right.guideOrder;
      return left.sourceOrder - right.sourceOrder;
    });
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
    const text = open ? `Ocultar ${label.toLowerCase()}` : label;
    return `<button class="action hint-action${open ? ' open' : ''}" type="button" data-action="toggle-panel" data-id="${esc(exerciseId)}" data-panel="${esc(panel)}">${esc(text)}</button>`;
  }

  function selectedOption(exerciseId) {
    return SELECTIONS[exerciseId] || '';
  }

  function selectionState(exercise) {
    const selected = selectedOption(exercise.id);
    const correct = exercise.correctOption?.label || '';
    return {
      selected,
      correct,
      hasSelection: !!selected,
      isCorrect: !!selected && selected === correct,
      canRetry: !!selected && !!correct && selected !== correct
    };
  }

  function optionTone(exercise, option) {
    const { selected, correct } = selectionState(exercise);

    if (!selected || !correct) return { tone: '', label: 'Selecciona' };
    if (option.label === selected && option.label === correct) return { tone: ' is-correct', label: 'Correcta' };
    if (option.label === selected && option.label !== correct) return { tone: ' is-wrong', label: 'Incorrecta' };
    if (selected !== correct && option.label === correct) return { tone: ' is-reveal', label: 'Correcta' };
    return { tone: ' is-dim', label: 'Opción' };
  }

  function optionList(exercise) {
    const { hasSelection } = selectionState(exercise);
    return `<div class="opts">${(exercise.options || [])
      .map((option) => {
        const state = optionTone(exercise, option);
        return `<button class="opt${state.tone}" type="button" data-action="pick-option" data-id="${esc(exercise.id)}" data-option="${esc(option.label)}"${hasSelection ? ' disabled' : ''}>
          <div class="row">
            <span class="let">${esc(option.label)}</span>
            <span class="lab">${esc(state.label)}</span>
          </div>
          <div>${esc(option.text)}</div>
        </button>`;
      })
      .join('')}</div>`;
  }

  function retryButton(exercise) {
    const { canRetry } = selectionState(exercise);
    if (!canRetry) return '';
    return `<button class="action retry-action" type="button" data-action="retry-option" data-id="${esc(exercise.id)}">Reintentar</button>`;
  }

  function card(exercise) {
    return `<article class="card" id="reactivo-${esc(exercise.id)}">
      <div class="head">
        <div>
          <div class="type">${esc(`${exercise.guideName} · Reactivo ${exercise.number}`)}</div>
          <h3>${esc(exercise.topic)}</h3>
        </div>
      </div>
      <div class="layout">
        <div class="block">
          <div class="problem-head">
            <div class="meta">Pregunta</div>
            <span class="reactivo-chip">${esc(`${exercise.options.length} opciones`)}</span>
          </div>
          ${question(exercise.questionLines)}
        </div>
        <div class="block">
          <div class="problem-head">
            <div class="meta">Opciones</div>
          </div>
          ${optionList(exercise)}
        </div>
      </div>
      <div class="actions act">
        ${retryButton(exercise)}
        ${panelButton(exercise.id, 'hint', 'Ver pista')}
      </div>
      <section class="support hint"${isOpen(exercise.id, 'hint') ? '' : ' hidden'}>
        <div class="meta">Pista</div>
        ${paragraphs(exercise.hint)}
      </section>
    </article>`;
  }

  function guideSection(guide, exercises) {
    if (!exercises.length) return '';
    return `<section class="section">
      <header class="section-head">
        <div>
          <h2>${esc(guide.name)}</h2>
          <p>${esc(GUIDE_TEXT[guide.id] || 'Consulta los reactivos de esta guía sin alterar su secuencia original.')}</p>
        </div>
        <span class="count">${esc(String(exercises.length))} reactivos</span>
      </header>
      <div class="cards">${exercises.map(card).join('')}</div>
    </section>`;
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
        return `<div class="guide-split">
          <div class="guide-split-head">
            <h3>${esc(guide ? guide.name : guideId)}</h3>
            <span>${esc(`${items.length} reactivos en su orden original`)}</span>
          </div>
          <div class="cards">${items.map(card).join('')}</div>
        </div>`;
      })
      .join('');

    return `<section class="section">
      <header class="section-head">
        <div>
          <h2>${esc(topic.name)}</h2>
          <p>Los reactivos aparecen agrupados por guía y respetan la secuencia de origen dentro de cada una.</p>
        </div>
        <span class="count">${esc(String(exercises.length))} reactivos</span>
      </header>
      ${splits}
    </section>`;
  }

  function home() {
    const guideCards = GUIDES.map((guide) => {
      const first = guide.exercises[0];
      const last = guide.exercises[guide.exercises.length - 1];
      return `<article class="info-card">
        <h3>${esc(guide.name)}</h3>
        <p>${esc(GUIDE_TEXT[guide.id] || '')}</p>
        <p>${esc(`${guide.exerciseCount} reactivos · orden ${first.number} a ${last.number}`)}</p>
        <button class="chip" type="button" data-action="view" data-view="${esc(guide.id)}">Entrar a ${esc(guide.name)}</button>
      </article>`;
    }).join('');

    const topicButtons = TOPICS.map((topic) =>
      `<button type="button" data-action="topic" data-topic="${esc(topic.id)}">${esc(`${topic.name} (${topic.exerciseCount})`)}</button>`
    ).join('');

    const previews = GUIDES.map((guide) => guideSection(guide, guide.exercises.slice(0, 2))).join('');

    return `<section class="panel">
      <h2>Ruta de consulta sugerida</h2>
      <p>Empieza por una guía si quieres seguir la secuencia completa. Entra a «Temas» si prefieres localizar contenidos específicos sin romper el orden interno. Selecciona una opción cuando quieras practicar y abre la pista solo si necesitas una orientación breve.</p>
      <div class="hero-grid">${guideCards}</div>
    </section>
    <section class="panel">
      <h2>Temas disponibles</h2>
      <p>La clasificación temática se toma directamente del material fuente. Sirve para consultar mejor, pero no altera la fidelidad de los reactivos.</p>
      <div class="quick-topics">${topicButtons}</div>
    </section>
    ${previews}`;
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
    const visibleTopics = STATE.view === 'inicio'
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
    ].map((item) => `<div><b>${esc(String(item.value))}</b><span>${esc(item.label)}</span></div>`).join('');
  }

  function render() {
    const list = matches();
    byId('topStats').textContent = `Visibles: ${list.length} | Guías: ${distinct(list, 'guideId')} | Temas: ${distinct(list, 'topicId')}`;
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

    byId('content').innerHTML = GUIDES
      .map((guide) => guideSection(guide, list.filter((exercise) => exercise.guideId === guide.id)))
      .join('') || '';
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

    if (action === 'pick-option') {
      const exerciseId = node.dataset.id;
      const option = node.dataset.option || '';
      if (!exerciseId || !option) return;
      SELECTIONS[exerciseId] = option;
      render();
      return;
    }

    if (action === 'retry-option') {
      const exerciseId = node.dataset.id;
      if (!exerciseId) return;
      delete SELECTIONS[exerciseId];
      render();
      return;
    }

    if (action === 'toggle-panel') {
      const exerciseId = node.dataset.id;
      const panel = node.dataset.panel;
      if (!PANELS[exerciseId]) PANELS[exerciseId] = {};
      const nextState = !PANELS[exerciseId][panel];
      PANELS[exerciseId][panel] = nextState;
      render();

      if (nextState) {
        window.requestAnimationFrame(() => {
          const cardNode = document.getElementById(`reactivo-${exerciseId}`);
          const supportNode = cardNode?.querySelector('.support');
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
    if (preset === 'temas' || preset === 'todos') STATE.guide = 'all';
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
