/* Standalone ice-cream arithmetic module; all progress uses its own storage key. */
(() => {
  'use strict';

  const KEY = 'math_ice_cream_progress_v1';
  const SETTINGS = {
    0: { max: 10, operands: 2 },
    1: { max: 20, operands: 2 },
    2: { max: 30, operands: 3 },
    3: { max: 50, operands: 2 },
    4: { max: 60, operands: 3 },
    5: { max: 100, operands: 2 },
    6: { max: 100, operands: 3 }
  };
  const SCOOP_COLORS = ['#f45b91', '#ffd23f', '#28b9e8', '#42c879', '#9a65e8', '#ff8b32'];
  let appShow = (id) => document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
  let progress = freshProgress();
  let currentLevel = 0;
  let currentRound = null;
  let assignedAnswers = new Map();
  let lockedTargets = new Set();
  let roundChecked = false;
  let mistakes = 0;
  let matchedCount = 0;
  let completed = false;
  let resultKind = null;
  let drag = null;
  let selectedScoop = null;
  let ignoreClickUntil = 0;

  function freshLevelStats() {
    return { completedRounds: 0, correctMatches: 0, incorrectAttempts: 0, bestMistakes: null };
  }
  function freshProgress() {
    const levels = {};
    for (let i = 0; i <= 6; i++) levels[i] = freshLevelStats();
    return { version: 1, lastLevel: 0, levels };
  }
  function normaliseProgress(value) {
    const clean = freshProgress();
    if (!value || typeof value !== 'object' || value.version !== 1) return clean;
    const remembered = Number(value.lastLevel);
    if (Number.isInteger(remembered) && SETTINGS[remembered]) clean.lastLevel = remembered;
    for (let i = 0; i <= 6; i++) {
      const saved = value.levels && value.levels[i];
      if (!saved || typeof saved !== 'object') continue;
      for (const key of ['completedRounds', 'correctMatches', 'incorrectAttempts']) {
        const n = Number(saved[key]);
        clean.levels[i][key] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
      }
      const best = saved.bestMistakes;
      clean.levels[i].bestMistakes = Number.isFinite(Number(best)) && best !== null && Number(best) >= 0 ? Math.floor(Number(best)) : null;
    }
    return clean;
  }
  function loadProgress() {
    try {
      const raw = window.localStorage.getItem(KEY);
      progress = raw ? normaliseProgress(JSON.parse(raw)) : freshProgress();
    } catch {
      progress = freshProgress();
    }
  }
  function saveProgress() {
    try { window.localStorage.setItem(KEY, JSON.stringify(progress)); }
    catch { /* The module remains playable when browser storage is disabled. */ }
  }
  function randomInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
  function shuffle(values) {
    const copy = values.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = randomInt(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function makeExercise(answer, max, operandCount, pattern) {
    if (operandCount === 2) {
      const op = pattern[0];
      if (op === '+') {
        const first = randomInt(0, answer);
        return { operands: [first, answer - first], operators: ['+'], answer };
      }
      const second = randomInt(0, max - answer);
      return { operands: [answer + second, second], operators: ['-'], answer };
    }
    const [firstOp, secondOp] = pattern;
    const intermediate = secondOp === '+' ? randomInt(0, answer) : randomInt(answer, max);
    let first, second;
    if (firstOp === '+') {
      first = randomInt(0, intermediate);
      second = intermediate - first;
    } else {
      first = randomInt(intermediate, max);
      second = first - intermediate;
    }
    const third = secondOp === '+' ? answer - intermediate : intermediate - answer;
    return { operands: [first, second, third], operators: [firstOp, secondOp], answer };
  }
  function expressionText(exercise) {
    let out = String(exercise.operands[0]);
    for (let i = 0; i < exercise.operators.length; i++) {
      out += ' ' + (exercise.operators[i] === '-' ? '−' : '+') + ' ' + exercise.operands[i + 1];
    }
    return out + ' = ?';
  }
  function validRound(round, settings) {
    if (!round || round.expressions.length !== 6 || round.scoops.length !== 7) return false;
    const answers = new Set();
    const equations = new Set();
    for (const item of round.expressions) {
      if (item.operands.length !== settings.operands || item.operators.length !== settings.operands - 1) return false;
      if (item.operands.some(n => !Number.isInteger(n) || n < 0 || n > settings.max)) return false;
      let value = item.operands[0];
      if (value < 0 || value > settings.max) return false;
      for (let i = 0; i < item.operators.length; i++) {
        value = item.operators[i] === '+' ? value + item.operands[i + 1] : value - item.operands[i + 1];
        if (value < 0 || value > settings.max) return false;
      }
      if (value !== item.answer || answers.has(value)) return false;
      answers.add(value);
      const identity = item.operands.join(',') + item.operators.join('');
      if (equations.has(identity)) return false;
      equations.add(identity);
    }
    const scoopSet = new Set(round.scoops);
    return scoopSet.size === 7 && round.scoops.every(n => Number.isInteger(n) && n >= 0 && n <= settings.max)
      && answers.size === 6 && round.scoops.filter(n => answers.has(n)).length === 6
      && scoopSet.has(round.distractor) && !answers.has(round.distractor);
  }
  function candidateRound(level, targets) {
    const settings = SETTINGS[level];
    const patterns = settings.operands === 2
      ? shuffle(['+', '+', '+', '-', '-', '-']).map(op => [op])
      : shuffle([['+', '+'], ['+', '-'], ['-', '+'], ['-', '-'], ['+', '-'], ['-', '+']]);
    const expressions = targets.map((answer, i) => {
      const exercise = makeExercise(answer, settings.max, settings.operands, patterns[i]);
      return { ...exercise, text: expressionText(exercise) };
    });
    const correctAnswers = new Set(expressions.map(item => item.answer));
    const distractors = Array.from({ length: settings.max + 1 }, (_, n) => n).filter(n => !correctAnswers.has(n));
    if (!distractors.length) return null;
    const distractor = distractors[randomInt(0, distractors.length - 1)];
    return { expressions, scoops: shuffle([...correctAnswers, distractor]), distractor };
  }
  function generateRound(level) {
    const settings = SETTINGS[level];
    if (!settings) throw new Error('Άγνωστη βαθμίδα');
    for (let attempt = 0; attempt < 40; attempt++) {
      const targets = shuffle(Array.from({ length: settings.max + 1 }, (_, i) => i)).slice(0, 6);
      const round = candidateRound(level, targets);
      if (round && validRound(round, settings)) return round;
    }
    // This bounded fallback guarantees a playable round if a future generator change regresses.
    const fallback = candidateRound(level, [0, 1, 2, 3, 4, 5]);
    if (!validRound(fallback, settings)) throw new Error('Δεν δημιουργήθηκε έγκυρος γύρος');
    return fallback;
  }
  function renderLevels() {
    const grid = document.querySelector('#mathLevelGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let level = 0; level <= 6; level++) {
      const settings = SETTINGS[level];
      const stats = progress.levels[level];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'math-level-card' + (level === progress.lastLevel ? ' is-last' : '');
      card.style.setProperty('--level-color', SCOOP_COLORS[level % SCOOP_COLORS.length]);
      card.setAttribute('aria-label', 'Άνοιγμα βαθμίδας ' + level + ', μέχρι το ' + settings.max);
      card.innerHTML = '<span class="level-number">' + level + '</span><h2>Βαθμίδα ' + level + (level === 0 ? ' · Ξεκινάμε!' : '') + '</h2><p>' + (level === 0 ? '6 πράξεις · 3 προσθέσεις και 3 αφαιρέσεις · μέχρι το 10' : 'Προσθέσεις και αφαιρέσεις · αριθμοί και αποτέλεσμα: 0–' + settings.max + ' · ' + settings.operands + ' αριθμοί') + '</p><small>' + stats.completedRounds + ' ολοκληρωμένοι γύροι · ' + (stats.bestMistakes === null ? 'χωρίς επίδοση ακόμη' : 'καλύτερη επίδοση: ' + stats.bestMistakes + (stats.bestMistakes === 1 ? ' λαθάκι' : ' λαθάκια')) + (level === progress.lastLevel ? '<span class="resume-hint"> · τελευταία βαθμίδα</span>' : '') + '</small>';
      card.addEventListener('click', () => startRound(level));
      grid.append(card);
    }
    const note = document.querySelector('#mathStorageNote');
    if (note) note.textContent = 'Η πρόοδος αποθηκεύεται σε αυτή τη συσκευή. Καλύτερη επίδοση: τα λιγότερα λαθάκια σε έναν ολοκληρωμένο γύρο. Δεν γίνεται συγχρονισμός μεταξύ συσκευών.';
  }
  function renderRound() {
    const settings = SETTINGS[currentLevel];
    document.querySelector('#mathGameTitle').textContent = 'Παγωτά και Μαθηματικά · Βαθμίδα ' + currentLevel;
    document.querySelector('#mathGameMeta').textContent = 'Μέχρι το ' + settings.max + ' · ' + settings.operands + ' αριθμοί σε κάθε πράξη';
    document.querySelector('#mathFeedback').textContent = 'Σύρε κάθε απάντηση στο παγωτό με τη σωστή πράξη.';
    const cones = document.querySelector('#mathCones');
    cones.innerHTML = currentRound.expressions.map((item, index) => '<article class="ice-cream-cone" data-cone="' + index + '" role="group" tabindex="0" aria-label="Παγωτό ' + (index + 1) + ': ' + item.text + '"><div class="cone-art"><svg class="cone-illustration" viewBox="0 0 220 250" aria-hidden="true" focusable="false"><defs><linearGradient id="coneGold' + index + '" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd47a"/><stop offset=".48" stop-color="#ef9b42"/><stop offset="1" stop-color="#bb612b"/></linearGradient><linearGradient id="cream' + index + '" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffefa"/><stop offset=".66" stop-color="#fffdf6"/><stop offset="1" stop-color="#f5e9d6"/></linearGradient><pattern id="waffle' + index + '" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(42)"><path d="M0 0V18 M9 0V18 M-9 9L9 -9 M0 18L18 0 M9 27L27 9" stroke="#ffe09a" stroke-width="3"/><path d="M3 0V18 M12 0V18 M-9 15L9 33 M0 -3L18 15 M9 9L27 27" stroke="#a95427" stroke-opacity=".55" stroke-width="1.5"/></pattern><clipPath id="coneClip' + index + '"><path d="M52 137 Q110 150 168 137 L116 238 Q110 247 104 238Z"/></clipPath></defs><path d="M52 137 Q110 150 168 137 L116 238 Q110 247 104 238Z" fill="url(#coneGold' + index + ')" stroke="#593a2c" stroke-width="4" stroke-linejoin="round"/><path d="M52 137 Q110 150 168 137 L116 238 Q110 247 104 238Z" fill="url(#waffle' + index + ')" clip-path="url(#coneClip' + index + ')"/><path d="M58 138 Q110 149 162 138" fill="none" stroke="#75452d" stroke-width="3"/><path d="M30 116 C18 111 16 96 27 87 C22 72 32 60 47 59 C49 42 64 35 79 42 C89 24 111 22 124 38 C140 27 160 34 162 51 C180 48 193 61 188 77 C204 88 199 107 184 113 C180 129 163 137 149 129 C137 144 117 146 105 134 C91 145 71 139 66 126 C50 136 35 131 30 116Z" fill="url(#cream' + index + ')" stroke="#554238" stroke-width="4" stroke-linejoin="round"/><path d="M39 100 C41 87 53 80 66 83 M83 51 C94 42 105 43 112 49 M139 50 C149 49 156 56 157 64" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".85"/><path d="M39 116 C64 127 76 119 87 126 C100 134 119 136 130 126 C145 136 164 129 174 117" fill="none" stroke="#eadbc7" stroke-width="4" stroke-linecap="round" opacity=".68"/></svg><span class="math-equation">' + item.text + '</span><div class="scoop-target" data-target="' + index + '" aria-label="Θέση απάντησης"><span>?</span></div></div></article>').join('');
    const bank = document.querySelector('#mathScoopBank');
    bank.innerHTML = currentRound.scoops.map((answer, index) => '<button type="button" class="answer-scoop" data-scoop="' + index + '" data-answer="' + answer + '" style="--scoop:' + SCOOP_COLORS[index % SCOOP_COLORS.length] + '" aria-label="Απάντηση ' + answer + '"><span class="scoop-number">' + answer + '</span><span class="scoop-sprinkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></button>').join('');
    dismissSuccessCard();
    syncCheckButton();
    document.querySelector('#mathFeedback').setAttribute('aria-live', 'polite');
  }
  function startRound(level) {
    currentLevel = Number(level);
    resultKind = null;
    progress.lastLevel = currentLevel;
    saveProgress();
    currentRound = generateRound(currentLevel);
    assignedAnswers = new Map();
    lockedTargets = new Set();
    roundChecked = false;
    mistakes = 0;
    matchedCount = 0;
    completed = false;
    selectedScoop = null;
    renderRound();
    appShow('mathGame');
  }
  function openModule() {
    dismissSuccessCard();
    clearRoundState();
    renderLevels();
    appShow('mathHome');
  }
  function dismissSuccessCard() {
    const card = document.querySelector('#mathSuccess');
    if (!card) return;
    card.hidden = true;
    card.querySelectorAll('.math-confetti').forEach(node => node.remove());
  }
  function clearRoundState() {
    currentRound = null;
    assignedAnswers.clear();
    lockedTargets.clear();
    roundChecked = false;
    mistakes = 0;
    matchedCount = 0;
    completed = false;
    resultKind = null;
    selectedScoop = null;
    drag = null;
  }
  function syncCheckButton() {
    const button = document.querySelector('#mathCheckAnswers');
    if (!button) return;
    button.disabled = assignedAnswers.size !== 6 || completed || roundChecked;
    button.textContent = roundChecked ? 'Έλεγχος ξανά' : 'Έλεγχος απαντήσεων';
  }
  function clearSelection() {
    selectedScoop?.classList.remove('is-selected');
    selectedScoop = null;
  }
  function selectScoop(scoop) {
    if (!scoop || scoop.dataset.used === 'true') return;
    if (selectedScoop === scoop) { clearSelection(); return; }
    clearSelection();
    selectedScoop = scoop;
    scoop.classList.add('is-selected');
    document.querySelector('#mathFeedback').textContent = 'Διάλεξες το ' + scoop.dataset.answer + '. Πάτησε το παγωτό που ταιριάζει ή σύρε την απάντηση.';
  }
  function showSuccess() {
    completed = true;
    resultKind = 'success';
    const stats = progress.levels[currentLevel];
    stats.completedRounds++;
    stats.bestMistakes = stats.bestMistakes === null ? mistakes : Math.min(stats.bestMistakes, mistakes);
    saveProgress();
    renderLevels();
    document.querySelector('#mathSuccessTitle').textContent = 'ΜΠΡΑΒΟ! ΤΑ ΚΑΤΑΦΕΡΕΣ!';
    document.querySelector('#mathSuccessMessage').textContent = 'Έλυσες όλες τις πράξεις. Είσαι σπουδαίος μαθηματικός!';
    document.querySelector('#mathReplay').textContent = 'Επανάληψη';
    document.querySelector('#mathNextRound').hidden = false;
    document.querySelector('#mathSuccess').hidden = false;
    const container = document.querySelector('#mathSuccess');
    container.querySelectorAll('.math-confetti').forEach(node => node.remove());
    for (let i = 0; i < 28; i++) {
      const piece = document.createElement('i');
      piece.className = 'math-confetti';
      piece.style.setProperty('--left', ((i * 37) % 100) + '%');
      piece.style.setProperty('--delay', (i % 7) * -0.18 + 's');
      piece.style.setProperty('--confetti-color', SCOOP_COLORS[i % SCOOP_COLORS.length]);
      container.append(piece);
    }
  }
  function showIncorrectResult() {
    resultKind = 'incorrect';
    document.querySelector('#mathSuccessTitle').textContent = 'Υπάρχει κάποιο λάθος! Προσπάθησε ξανά!';
    document.querySelector('#mathSuccessMessage').textContent = 'Οι απαντήσεις με κόκκινο περίγραμμα χρειάζονται διόρθωση. Πάτησέ τες για να αλλάξεις την απάντηση.';
    document.querySelector('#mathReplay').textContent = 'Προσπάθησε ξανά';
    document.querySelector('#mathNextRound').hidden = true;
    document.querySelector('#mathSuccess').hidden = false;
  }
  function resolveDrop(scoop, cone) {
    if (completed || !scoop || scoop.dataset.used === 'true' || !cone) return;
    const index = Number(cone.dataset.cone);
    if (!Number.isInteger(index) || lockedTargets.has(index) || cone.classList.contains('is-correct')) return;
    if (roundChecked || !Number.isInteger(index) || index < 0 || index > 5 || lockedTargets.has(index) || assignedAnswers.has(index)) return;
    const target = cone.querySelector('.scoop-target');
    target.replaceChildren(scoop);
    target.setAttribute('aria-label', 'Τοποθετημένη απάντηση ' + scoop.dataset.answer);
    scoop.dataset.used = 'true';
    scoop.classList.remove('is-selected');
    scoop.classList.add('is-placed');
    scoop.setAttribute('aria-label', 'Τοποθετημένη απάντηση ' + scoop.dataset.answer + '. Πάτησε για αφαίρεση.');
    assignedAnswers.set(index, scoop);
    cone.classList.remove('is-incorrect', 'is-error');
    if (selectedScoop === scoop) selectedScoop = null;
    syncCheckButton();
    document.querySelector('#mathFeedback').textContent = 'Τοποθέτησες ' + assignedAnswers.size + ' από τις 6 απαντήσεις.';
  }
  function returnPlacedAnswer(scoop, cone) {
    if (!scoop || !cone || completed) return;
    const index = Number(cone.dataset.cone);
    if (lockedTargets.has(index) || assignedAnswers.get(index) !== scoop) return;
    assignedAnswers.delete(index);
    roundChecked = false;
    scoop.dataset.used = 'false';
    scoop.classList.remove('is-placed', 'is-selected');
    scoop.setAttribute('aria-label', 'Απάντηση ' + scoop.dataset.answer);
    const target = cone.querySelector('.scoop-target');
    target.replaceChildren(Object.assign(document.createElement('span'), { textContent: '?' }));
    target.setAttribute('aria-label', 'Θέση απάντησης');
    cone.classList.remove('is-incorrect', 'is-error');
    document.querySelector('#mathScoopBank').append(scoop);
    syncCheckButton();
    document.querySelector('#mathFeedback').textContent = 'Η απάντηση επέστρεψε στις επιλογές.';
  }
  function checkAnswers() {
    if (completed || assignedAnswers.size !== 6) return;
    roundChecked = true;
    let correctNow = 0;
    let incorrect = 0;
    for (const [index, scoop] of assignedAnswers) {
      const cone = document.querySelector('#mathCones').querySelector('[data-cone="' + index + '"]');
      if (Number(scoop.dataset.answer) === currentRound.expressions[index].answer) {
        lockedTargets.add(index);
        cone.classList.add('is-correct');
        cone.classList.remove('is-incorrect');
        scoop.setAttribute('aria-label', 'Σωστή απάντηση ' + scoop.dataset.answer);
        correctNow++;
      } else {
        cone.classList.add('is-incorrect');
        incorrect++;
      }
    }
    matchedCount = lockedTargets.size;
    mistakes += incorrect;
    progress.levels[currentLevel].correctMatches += correctNow;
    progress.levels[currentLevel].incorrectAttempts += incorrect;
    saveProgress();
    syncCheckButton();
    if (matchedCount === 6) showSuccess();
    else showIncorrectResult();
  }
  function onPointerDown(event) {
    const scoop = event.target.closest('.answer-scoop');
    if (!scoop || scoop.dataset.used === 'true' || completed) return;
    drag = { scoop, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, ghost: null };
    try { scoop.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  }
  function onPointerMove(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
    event.preventDefault();
    drag.moved = true;
    if (!drag.ghost) {
      drag.ghost = drag.scoop.cloneNode(true);
      drag.ghost.classList.add('math-drag-ghost');
      drag.ghost.removeAttribute('data-scoop');
      drag.ghost.setAttribute('aria-hidden', 'true');
      document.body.append(drag.ghost);
      drag.scoop.classList.add('is-selected');
    }
    drag.ghost.style.left = event.clientX + 'px';
    drag.ghost.style.top = event.clientY + 'px';
  }
  function onPointerUp(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const state = drag;
    drag = null;
    if (state.ghost) state.ghost.remove();
    if (!state.moved) return;
    ignoreClickUntil = Date.now() + 350;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const cone = target && target.closest('.ice-cream-cone');
    if (cone) resolveDrop(state.scoop, cone);
    else state.scoop.classList.remove('is-selected');
    if (selectedScoop === state.scoop && state.scoop.dataset.used === 'true') selectedScoop = null;
  }
  function onPointerCancel(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.ghost) drag.ghost.remove();
    drag.scoop.classList.remove('is-selected');
    drag = null;
  }
  function init(options) {
    appShow = options && options.show ? options.show : appShow;
    loadProgress();
    currentLevel = progress.lastLevel;
    document.querySelector('#mathModuleCard').addEventListener('click', openModule);
    document.querySelector('#mathHomeBack').addEventListener('click', () => appShow('appHome'));
    document.querySelector('#mathLevelsBack').addEventListener('click', openModule);
    document.querySelector('#mathReplay').addEventListener('click', () => {
      if (resultKind === 'incorrect') {
        dismissSuccessCard();
        document.querySelector('#mathFeedback').textContent = 'Υπάρχει κάποιο λάθος! Πάτησε τις απαντήσεις με κόκκινο περίγραμμα για να τις διορθώσεις.';
        return;
      }
      startRound(currentLevel);
    });
    document.querySelector('#mathNextRound').addEventListener('click', () => startRound(currentLevel));
    document.querySelector('#mathSuccessLevels').addEventListener('click', openModule);
    document.querySelector('#mathSuccessHome').addEventListener('click', () => { dismissSuccessCard(); clearRoundState(); appShow('appHome'); });
    document.querySelector('#mathCheckAnswers').addEventListener('click', checkAnswers);
    document.querySelector('#mathCones').addEventListener('click', event => {
      if (Date.now() < ignoreClickUntil) return;
      const placed = event.target.closest('.answer-scoop');
      if (placed) {
        const cone = placed.closest('.ice-cream-cone');
        if (cone) returnPlacedAnswer(placed, cone);
        return;
      }
      const cone = event.target.closest('.ice-cream-cone');
      if (cone && selectedScoop) resolveDrop(selectedScoop, cone);
    });
    document.querySelector('#mathScoopBank').addEventListener('click', event => {
      if (Date.now() < ignoreClickUntil) return;
      const scoop = event.target.closest('.answer-scoop');
      if (scoop && !scoop.disabled && scoop.dataset.used !== 'true') selectScoop(scoop);
    });
    const board = document.querySelector('#mathBoard');
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove, { passive: false });
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', onPointerCancel);
    document.querySelector('#mathCones').addEventListener('keydown', event => {
      const cone = event.target.closest('.ice-cream-cone');
      const placed = event.target.closest('.answer-scoop');
      if (placed && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        const parentCone = placed.closest('.ice-cream-cone');
        if (parentCone) returnPlacedAnswer(placed, parentCone);
      } else if (cone && selectedScoop && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        resolveDrop(selectedScoop, cone);
      }
    });
    renderLevels();
  }

  window.MathIceCream = { init, generateRound, validRound, settings: SETTINGS, storageKey: KEY };
})();
