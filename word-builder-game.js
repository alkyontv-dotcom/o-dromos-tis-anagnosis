/* Image-only picker and letter-tile game for the ordered 60-word collection. */
(() => {
  'use strict';

  const items = window.WORD_BUILDING_ITEMS;
  let showScreen = (id) => document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
  let currentIndex = 0;
  let letters = [];
  let slots = [];
  let finished = false;
  let attemptNumber = 0;
  const tileColors = ['#ffe4e9', '#fff0bf', '#dff1fb', '#e3f4e8', '#eee6ff', '#ffe9d5'];

  const byId = (id) => document.getElementById(id);
  const normalize = (text) => text.normalize('NFC');

  function shuffledLetters(word) {
    const next = Array.from(normalize(word));
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    if (next.length > 1 && next.every((letter, i) => letter === letters[i])) {
      [next[0], next[1]] = [next[1], next[0]];
    }
    return next;
  }

  function imageFrame(item, extraClass) {
    const frame = document.createElement('span');
    frame.className = 'word-picture-frame' + (extraClass ? ' ' + extraClass : '');
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = '';
    image.draggable = false;
    frame.append(image);
    return frame;
  }

  function renderPicker() {
    const grid = byId('wordBuilderPictures');
    grid.replaceChildren();
    items.forEach((item, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'word-picture-card';
      card.dataset.wordIndex = String(index);
      card.setAttribute('aria-label', 'Εικόνα ' + item.id);
      card.append(imageFrame(item));
      grid.append(card);
    });
  }

  function renderBoard() {
    const item = items[currentIndex];
    byId('wordBuilderIllustration').replaceChildren(imageFrame(item, 'word-game-picture'));
    byId('wordBuilderIllustration').setAttribute('aria-label', 'Εικονογράφηση λέξης');
    const answer = byId('wordBuilderAnswer');
    answer.replaceChildren();
    slots.forEach((tileIndex, slotIndex) => {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'word-letter-slot' + (tileIndex === null ? ' is-empty' : ' is-filled');
      slot.dataset.slotIndex = String(slotIndex);
      slot.setAttribute('aria-label', 'Θέση γράμματος ' + (slotIndex + 1) + (tileIndex === null ? ', κενή' : ', αφαίρεση γράμματος'));
      slot.textContent = tileIndex === null ? '' : letters[tileIndex];
      answer.append(slot);
    });

    const bank = byId('wordBuilderTiles');
    bank.replaceChildren();
    letters.forEach((letter, tileIndex) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'word-letter-tile';
      tile.dataset.tileIndex = String(tileIndex);
      tile.textContent = letter;
      tile.style.setProperty('--tile-color', tileColors[tileIndex % tileColors.length]);
      const placed = slots.includes(tileIndex);
      tile.disabled = placed || finished;
      tile.setAttribute('aria-label', 'Γράμμα ' + letter + (placed ? ', τοποθετημένο' : ''));
      bank.append(tile);
    });
  }

  function setResult(correct) {
    finished = true;
    byId('wordBuilderFeedback').textContent = correct ? 'Μπράβο!' : 'Δεν πειράζει, δοκίμασε ξανά!';
    const actions = byId('wordBuilderResultActions');
    actions.replaceChildren();
    if (correct) {
      addAction(actions, 'Επανάληψη', 'primary', () => startItem(currentIndex));
      if (currentIndex < items.length - 1) {
        addAction(actions, 'Επόμενη λέξη', 'secondary', () => startItem(currentIndex + 1));
      } else {
        addAction(actions, 'Επιστροφή στις εικόνες', 'secondary', returnToPicker);
      }
    } else {
      addAction(actions, 'Προσπάθησε ξανά', 'primary', () => startItem(currentIndex));
      addAction(actions, 'Επόμενη λέξη', 'secondary', () => {
        if (currentIndex < items.length - 1) startItem(currentIndex + 1);
        else showEndOfList();
      });
    }
    byId('wordBuilderResult').hidden = false;
    renderBoard();
  }

  function addAction(parent, label, className, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className + (label === 'Επόμενη λέξη' ? ' next-action' : '');
    button.textContent = label;
    button.addEventListener('click', action);
    parent.append(button);
  }

  function checkAnswer() {
    const answer = slots.map(tileIndex => letters[tileIndex]).join('');
    setResult(normalize(answer) === normalize(items[currentIndex].word));
  }

  function startItem(index) {
    currentIndex = index;
    finished = false;
    attemptNumber++;
    const item = items[currentIndex];
    letters = shuffledLetters(item.word);
    slots = Array.from({ length: Array.from(normalize(item.word)).length }, () => null);
    byId('wordBuilderGameTitle').textContent = 'Ας φτιάξουμε Λέξεις';
    byId('wordBuilderResult').hidden = true;
    byId('wordBuilderEnd').hidden = true;
    byId('wordBuilderBoard').hidden = false;
    renderBoard();
    showScreen('wordBuilderGame');
  }

  function showEndOfList() {
    byId('wordBuilderBoard').hidden = true;
    byId('wordBuilderResult').hidden = true;
    byId('wordBuilderEnd').hidden = false;
    showScreen('wordBuilderGame');
  }

  function returnToPicker() {
    byId('wordBuilderResult').hidden = true;
    byId('wordBuilderEnd').hidden = true;
    byId('wordBuilderBoard').hidden = false;
    showScreen('wordBuilderSelect');
  }

  function chooseTile(tileIndex) {
    if (finished || slots.includes(tileIndex)) return;
    const emptySlot = slots.indexOf(null);
    if (emptySlot < 0) return;
    slots[emptySlot] = tileIndex;
    renderBoard();
    if (slots.every(index => index !== null)) checkAnswer();
  }

  function clearSlot(slotIndex) {
    if (finished || !Number.isInteger(slotIndex) || slots[slotIndex] === null) return;
    slots[slotIndex] = null;
    renderBoard();
  }

  function init(options) {
    showScreen = options && options.show ? options.show : showScreen;
    renderPicker();
    byId('wordBuilderModuleCard').addEventListener('click', () => showScreen('wordBuilderSelect'));
    byId('wordBuilderHomeBack').addEventListener('click', () => showScreen('appHome'));
    byId('wordBuilderSelectBack').addEventListener('click', returnToPicker);
    byId('wordBuilderStartOver').addEventListener('click', () => startItem(0));
    byId('wordBuilderEndBack').addEventListener('click', returnToPicker);
    byId('wordBuilderPictures').addEventListener('click', event => {
      const card = event.target.closest('[data-word-index]');
      if (card) startItem(Number(card.dataset.wordIndex));
    });
    byId('wordBuilderTiles').addEventListener('click', event => {
      const tile = event.target.closest('[data-tile-index]');
      if (tile && !tile.disabled) chooseTile(Number(tile.dataset.tileIndex));
    });
    byId('wordBuilderAnswer').addEventListener('click', event => {
      const slot = event.target.closest('[data-slot-index]');
      if (slot) clearSlot(Number(slot.dataset.slotIndex));
    });
  }

  window.WordBuilder = { init, items, startItem, returnToPicker, getCurrentItem: () => items[currentIndex], getAttemptNumber: () => attemptNumber };
})();
