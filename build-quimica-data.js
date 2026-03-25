const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT_FILE = path.join(ROOT, 'quimica-data.js');

const GUIDE_FILES = [
  { id: 'guia-1', name: 'Guía 1', filePattern: /gu[ií]a\s*1/i },
  { id: 'guia-2', name: 'Guía 2', filePattern: /gu[ií]a\s*2/i }
];

const SECTION_LABELS = [
  'Temática del ejercicio:',
  'Reactivo:',
  'Fuente:',
  'Planteamiento del problema:',
  'Opciones:',
  'Qué pide resolver el ejercicio:',
  'Desarrollo y descarte de opciones:',
  'Opción correcta:',
  'Argumento:',
  'Pista:'
];

const TAG_STOPWORDS = new Set([
  'a',
  'al',
  'aquellas',
  'con',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'los',
  'para',
  'por',
  'que',
  'su',
  'sus',
  'un',
  'una',
  'y'
]);

function findGuideFile(pattern) {
  const entry = fs
    .readdirSync(ROOT)
    .find((name) => pattern.test(name) && name.toLowerCase().endsWith('.txt'));

  if (!entry) {
    throw new Error(`No se encontró un archivo .txt para el patrón ${pattern}.`);
  }

  return path.join(ROOT, entry);
}

function toMexicoTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function stripReferences(text) {
  return String(text || '')
    .replace(/\uFEFF/g, '')
    .replace(/:contentReference\[[^\]]+\]\{[^}]+\}/g, '')
    .replace(/[ \t]+$/gm, '');
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && !String(lines[start] || '').trim()) start += 1;
  while (end > start && !String(lines[end - 1] || '').trim()) end -= 1;

  return lines.slice(start, end);
}

function cleanInline(text) {
  return stripReferences(String(text || '').replace(/\r/g, '')).trim();
}

function joinLines(lines) {
  const normalized = trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .filter((line) => line && line !== '---');
  return normalized.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function slugify(text) {
  return cleanInline(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeForToken(text) {
  return cleanInline(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildTags(topic) {
  const tokens = normalizeForToken(topic)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !TAG_STOPWORDS.has(token))
    .slice(0, 4);

  return Array.from(new Set([slugify(topic), ...tokens]));
}

function splitExerciseBlocks(rawText) {
  const lines = stripReferences(rawText).replace(/\r\n/g, '\n').split('\n');
  const starts = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (cleanInline(lines[index]).startsWith('Temática del ejercicio:')) {
      starts.push(index);
    }
  }

  return starts
    .map((startIndex, index) => {
      const endIndex = index + 1 < starts.length ? starts[index + 1] : lines.length;
      return lines.slice(startIndex, endIndex);
    })
    .filter((block) => block.some((line) => cleanInline(line).startsWith('Reactivo:')));
}

function extractSection(lines, startLabel, endLabels) {
  const startIndex = lines.findIndex((line) => cleanInline(line) === startLabel);
  if (startIndex === -1) return [];

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const label = cleanInline(lines[index]);
    if (endLabels.includes(label)) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex + 1, endIndex);
}

function parseOptions(lines) {
  const options = [];
  let current = null;

  for (const rawLine of trimBlankLines(lines)) {
    const line = cleanInline(rawLine);
    if (!line) continue;

    const match = line.match(/^([A-E])\)\s*(.*)$/);
    if (match) {
      if (current) options.push(current);
      current = {
        label: match[1],
        text: cleanInline(match[2])
      };
      continue;
    }

    if (current) {
      current.text = cleanInline(`${current.text} ${line}`);
    }
  }

  if (current) options.push(current);
  return options;
}

function sanitizeAnalysisParagraph(paragraph) {
  const normalized = normalizeForToken(paragraph);
  if (
    /respuesta correcta|la correcta es|opcion correcta|esta es la correcta|opcion buena/.test(normalized) ||
    /^se conserva\b/.test(normalized) ||
    /^se descarta\b/.test(normalized) ||
    /\bmas precisa\b/.test(normalized) ||
    /\bmejor coincide\b/.test(normalized) ||
    /\bjusto describe\b/.test(normalized) ||
    /\bunica que\b/.test(normalized)
  ) {
    return '';
  }

  return paragraph
    .replace(/^Esta opción apunta a la idea correcta:\s*/i, 'Esta opción reúne varios elementos relacionados con el tema. ')
    .replace(/^Esta opcion apunta a la idea correcta:\s*/i, 'Esta opción reúne varios elementos relacionados con el tema. ')
    .replace(/\bcorrectas\b/gi, 'pertinentes')
    .replace(/\bcorrectos\b/gi, 'pertinentes')
    .replace(/\bcorrecta\b/gi, 'pertinente')
    .replace(/\bcorrecto\b/gi, 'pertinente')
    .replace(/\bincorrectas\b/gi, 'imprecisas')
    .replace(/\bincorrectos\b/gi, 'imprecisos')
    .replace(/\bincorrecta\b/gi, 'imprecisa')
    .replace(/\bincorrecto\b/gi, 'impreciso')
    .replace(/\bacierta\b/gi, 'coincide');
}

function sanitizeAnalysisText(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeForToken(line);
      return !(
        /^se conserva\b/.test(normalized) ||
        /^se descarta\b/.test(normalized) ||
        /respuesta correcta|la correcta es|opcion correcta|esta es la correcta|opcion buena/.test(normalized) ||
        /\bcoincide con la descripcion correcta\b/.test(normalized) ||
        /\bcoinciden correctamente\b/.test(normalized) ||
        /\bno hay palabra incorrecta aqui\b/.test(normalized) ||
        /\bmas precisa\b/.test(normalized) ||
        /\bmejor coincide\b/.test(normalized) ||
        /\bjusto describe\b/.test(normalized) ||
        /\bunica que\b/.test(normalized)
      );
    })
    .map((line) => sanitizeAnalysisParagraph(line))
    .filter(Boolean);

  return lines
    .join('\n')
    .replace(/^Se conserva.*$/gim, '')
    .replace(/^Se descarta.*$/gim, '')
    .replace(/^No hay palabra incorrecta aquí\..*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function finalizeAnalysisText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeForToken(line);
      return !(
        /^se conserva\b/.test(normalized) ||
        /^se descarta\b/.test(normalized) ||
        /respuesta correcta|la correcta es|opcion correcta|esta es la correcta|opcion buena/.test(normalized)
      );
    })
    .map((line) => line
      .replace(/\bcorrectas\b/gi, 'pertinentes')
      .replace(/\bcorrectos\b/gi, 'pertinentes')
      .replace(/\bcorrecta\b/gi, 'pertinente')
      .replace(/\bcorrecto\b/gi, 'pertinente')
      .replace(/\bincorrectas\b/gi, 'imprecisas')
      .replace(/\bincorrectos\b/gi, 'imprecisos')
      .replace(/\bincorrecta\b/gi, 'imprecisa')
      .replace(/\bincorrecto\b/gi, 'impreciso')
      .replace(/\bacierta\b/gi, 'coincide'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseOptionsAnalysis(lines, optionMap) {
  const items = [];
  let current = null;

  for (const rawLine of trimBlankLines(lines)) {
    const line = cleanInline(rawLine);

    if (!line) {
      if (current && current.lines[current.lines.length - 1] !== '') {
        current.lines.push('');
      }
      continue;
    }

    const match = line.match(/^([A-E])\)\s*(.*)$/);
    if (match) {
      if (current) items.push(current);
      current = {
        label: match[1],
        option: optionMap.get(match[1]) || cleanInline(match[2]),
        lines: []
      };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) items.push(current);

  return items.map((item) => ({
    label: item.label,
    option: item.option,
    text: sanitizeAnalysisText(joinLines(item.lines))
  }));
}

function parseCorrectOption(lines, optionMap) {
  const firstLine = trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .find(Boolean);

  if (!firstLine) {
    throw new Error('No se encontró una opción correcta visible en el bloque.');
  }

  const match = firstLine.match(/^([A-E])\)\s*(.*)$/);
  if (!match) {
    throw new Error(`No se pudo interpretar la opción correcta: "${firstLine}".`);
  }

  const label = match[1];
  return {
    label,
    text: optionMap.get(label) || cleanInline(match[2])
  };
}

function validateBlock(blockLines, guideName) {
  for (const label of SECTION_LABELS) {
    if (!blockLines.some((line) => cleanInline(line) === label || cleanInline(line).startsWith(label))) {
      throw new Error(`Falta la sección "${label}" en un bloque de ${guideName}.`);
    }
  }
}

function parseExercise(blockLines, guide, order) {
  validateBlock(blockLines, guide.name);

  const topicLine = blockLines.find((line) => cleanInline(line).startsWith('Temática del ejercicio:'));
  const reactivoLine = blockLines.find((line) => cleanInline(line).startsWith('Reactivo:'));

  const topic = cleanInline(topicLine.split(':').slice(1).join(':'));
  const number = Number(cleanInline(reactivoLine.split(':').slice(1).join(':')));

  if (!Number.isFinite(number)) {
    throw new Error(`No se pudo leer el número de reactivo para ${guide.name}.`);
  }

  const questionLines = trimBlankLines(
    extractSection(blockLines, 'Planteamiento del problema:', ['Opciones:'])
  ).map((line) => cleanInline(line));

  const options = parseOptions(
    extractSection(blockLines, 'Opciones:', ['Qué pide resolver el ejercicio:'])
  );
  const optionMap = new Map(options.map((option) => [option.label, option.text]));

  const whatToSolve = joinLines(
    extractSection(blockLines, 'Qué pide resolver el ejercicio:', ['Desarrollo y descarte de opciones:'])
  );
  const optionsAnalysis = parseOptionsAnalysis(
    extractSection(blockLines, 'Desarrollo y descarte de opciones:', ['Opción correcta:']),
    optionMap
  ).map((item) => ({
    ...item,
    text: finalizeAnalysisText(item.text)
  }));
  const correctOption = parseCorrectOption(
    extractSection(blockLines, 'Opción correcta:', ['Argumento:']),
    optionMap
  );
  const hint = joinLines(extractSection(blockLines, 'Pista:', []));

  return {
    id: `${guide.id.replace('guia-', 'g')}-r${number}`,
    guideId: guide.id,
    guideName: guide.name,
    number,
    order,
    sourceOrder: order,
    topic,
    topicId: slugify(topic),
    question: questionLines.join('\n'),
    questionLines,
    options,
    correctOption,
    hint,
    tags: buildTags(topic)
  };
}

function buildGuideData(guide) {
  const sourceFile = findGuideFile(guide.filePattern);
  const rawText = fs.readFileSync(sourceFile, 'utf8');
  const blocks = splitExerciseBlocks(rawText);
  const exercises = blocks.map((block, index) => parseExercise(block, guide, index + 1));

  if (exercises.length !== 12) {
    throw new Error(`${guide.name} debe contener 12 reactivos y se detectaron ${exercises.length}.`);
  }

  const expectedNumbers = Array.from({ length: 12 }, (_, index) => 41 + index);
  const actualNumbers = exercises.map((exercise) => exercise.number);
  if (expectedNumbers.join(',') !== actualNumbers.join(',')) {
    throw new Error(
      `${guide.name} no conserva el orden esperado 41-52. Obtenido: ${actualNumbers.join(', ')}`
    );
  }

  return {
    id: guide.id,
    name: guide.name,
    exerciseCount: exercises.length,
    exercises
  };
}

function buildTopics(guides) {
  const topicMap = new Map();

  for (const guide of guides) {
    for (const exercise of guide.exercises) {
      if (!topicMap.has(exercise.topicId)) {
        topicMap.set(exercise.topicId, {
          id: exercise.topicId,
          name: exercise.topic,
          exerciseCount: 0,
          guides: new Set()
        });
      }

      const entry = topicMap.get(exercise.topicId);
      entry.exerciseCount += 1;
      entry.guides.add(guide.id);
    }
  }

  return Array.from(topicMap.values())
    .map((topic) => ({
      id: topic.id,
      name: topic.name,
      exerciseCount: topic.exerciseCount,
      guides: Array.from(topic.guides)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

function buildAppData() {
  const guides = GUIDE_FILES.map(buildGuideData);
  const totalExercises = guides.reduce((sum, guide) => sum + guide.exerciseCount, 0);
  const topics = buildTopics(guides);

  if (totalExercises !== 24) {
    throw new Error(`Se esperaban 24 reactivos y se obtuvieron ${totalExercises}.`);
  }

  return {
    meta: {
      title: 'Instituto Fernando Ramírez · ECOEMS Química',
      subject: 'Química',
      version: '1.0.0',
      generatedAt: toMexicoTimestamp(),
      totalExercises,
      topicCount: topics.length
    },
    topics,
    guides
  };
}

function writeOutput() {
  const data = buildAppData();
  const content = `window.IFR_APP_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
  return data;
}

if (require.main === module) {
  const data = writeOutput();
  console.log(`Archivo generado: ${path.basename(OUTPUT_FILE)}`);
  console.log(`Reactivos generados: ${data.meta.totalExercises}`);
  console.log(`Temas detectados: ${data.meta.topicCount}`);
}

module.exports = {
  buildAppData,
  writeOutput
};
