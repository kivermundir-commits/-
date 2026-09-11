(() => {
  "use strict";

  const STORAGE_KEY = "spyGameStateV1";
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 30;

  if (!Array.isArray(window.wordPairs) || window.wordPairs.length === 0) {
    alert("База слов не загрузилась. Проверьте файл words.js.");
    return;
  }

  const screens = [...document.querySelectorAll(".screen")];

  const elements = {
    home: document.getElementById("home-screen"),
    settings: document.getElementById("settings-screen"),
    card: document.getElementById("card-screen"),
    complete: document.getElementById("complete-screen"),

    startGame: document.getElementById("start-game-btn"),
    playersMinus: document.getElementById("players-minus"),
    playersPlus: document.getElementById("players-plus"),
    spiesMinus: document.getElementById("spies-minus"),
    spiesPlus: document.getElementById("spies-plus"),
    playersValue: document.getElementById("players-value"),
    spiesValue: document.getElementById("spies-value"),
    recommendation: document.getElementById("recommendation"),
    settingsError: document.getElementById("settings-error"),
    deal: document.getElementById("deal-btn"),
    settingsEnd: document.getElementById("settings-end-btn"),

    roundLabel: document.getElementById("round-label"),
    playerProgress: document.getElementById("player-progress"),
    progressBar: document.getElementById("progress-bar"),
    secretCard: document.getElementById("secret-card"),
    closedContent: document.getElementById("card-closed-content"),
    revealedContent: document.getElementById("card-revealed-content"),
    playerNumber: document.getElementById("card-title"),
    secretWord: document.getElementById("secret-word"),
    handoffPanel: document.getElementById("handoff-panel"),
    handoffText: document.getElementById("handoff-text"),
    readyNext: document.getElementById("ready-next-btn"),

    completeRound: document.getElementById("complete-round"),
    usedCount: document.getElementById("used-count"),
    nextRound: document.getElementById("next-round-btn"),
    changeSettings: document.getElementById("change-settings-btn"),
    endGame: document.getElementById("end-game-btn"),

    modal: document.getElementById("confirm-modal"),
    confirmEnd: document.getElementById("confirm-end-btn"),
    cancelEnd: document.getElementById("cancel-end-btn"),
    toast: document.getElementById("toast")
  };

  const defaultState = () => ({
    sessionActive: false,
    screen: "home",
    players: 6,
    spies: 1,
    roundNumber: 0,
    usedPairIds: [],
    currentPairId: null,
    majorityWord: "",
    spyWord: "",
    spyPlayers: [],
    currentPlayer: 1,
    cardStage: "closed"
  });

  let state = loadState();
  let touchStartX = null;
  let touchStartY = null;
  let toastTimer = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") {
        return defaultState();
      }

      const restored = { ...defaultState(), ...saved };

      // После обновления открытое секретное слово всегда снова закрывается.
      if (restored.screen === "card" && restored.cardStage === "revealed") {
        restored.cardStage = "closed";
      }

      restored.players = clamp(Number(restored.players) || 6, MIN_PLAYERS, MAX_PLAYERS);
      restored.spies = clamp(Number(restored.spies) || 1, 1, restored.players - 2);
      restored.usedPairIds = Array.isArray(restored.usedPairIds) ? restored.usedPairIds : [];
      restored.spyPlayers = Array.isArray(restored.spyPlayers) ? restored.spyPlayers : [];

      return restored;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      showToast("Не удалось сохранить прогресс в браузере");
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function showScreen(name) {
    screens.forEach((screen) => screen.classList.remove("active"));
    elements[name].classList.add("active");
    state.screen = name;
    saveState();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elements.toast.classList.add("hidden");
    }, 2800);
  }

  function recommendedSpies(players) {
    if (players <= 6) return "Для этой компании рекомендуется 1 шпион.";
    if (players <= 10) return "Рекомендуется 1–2 шпиона.";
    if (players <= 16) return "Рекомендуется 2–3 шпиона.";
    return "Рекомендуется 3–4 шпиона.";
  }

  function renderSettings() {
    state.spies = clamp(state.spies, 1, state.players - 2);
    elements.playersValue.textContent = state.players;
    elements.spiesValue.textContent = state.spies;
    elements.recommendation.textContent =
      `${recommendedSpies(state.players)} В игре всегда останется минимум два обычных игрока.`;
    elements.settingsEnd.classList.toggle("hidden", !state.sessionActive);
    elements.settingsError.textContent = "";
    saveState();
  }

  function changePlayers(delta) {
    state.players = clamp(state.players + delta, MIN_PLAYERS, MAX_PLAYERS);
    state.spies = clamp(state.spies, 1, state.players - 2);
    renderSettings();
  }

  function changeSpies(delta) {
    state.spies = clamp(state.spies + delta, 1, state.players - 2);
    renderSettings();
  }

  function sample(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  function selectUniqueSpyPlayers(players, spies) {
    const numbers = Array.from({ length: players }, (_, index) => index + 1);

    for (let i = numbers.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }

    return numbers.slice(0, spies).sort((a, b) => a - b);
  }

  function startRound() {
    elements.settingsError.textContent = "";

    if (state.players < MIN_PLAYERS) {
      elements.settingsError.textContent = "Нужно минимум 3 игрока.";
      return;
    }

    if (state.spies < 1 || state.spies > state.players - 2) {
      elements.settingsError.textContent =
        "В игре должно остаться минимум два обычных игрока.";
      return;
    }

    const usedIds = new Set(state.usedPairIds);
    const availablePairs = window.wordPairs.filter((pair) => !usedIds.has(pair.id));

    if (availablePairs.length === 0) {
      showToast("Все 2000 пар уже использованы. Завершите игру, чтобы очистить историю.");
      openEndModal();
      return;
    }

    const pair = sample(availablePairs);
    const reverseWords = Math.random() < 0.5;

    state.sessionActive = true;
    state.roundNumber += 1;
    state.currentPairId = pair.id;
    state.majorityWord = reverseWords ? pair.wordB : pair.wordA;
    state.spyWord = reverseWords ? pair.wordA : pair.wordB;
    state.spyPlayers = selectUniqueSpyPlayers(state.players, state.spies);
    state.currentPlayer = 1;
    state.cardStage = "closed";

    if (!state.usedPairIds.includes(pair.id)) {
      state.usedPairIds.push(pair.id);
    }

    saveState();
    renderCard();
    showScreen("card");
  }

  function getWordForCurrentPlayer() {
    return state.spyPlayers.includes(state.currentPlayer)
      ? state.spyWord
      : state.majorityWord;
  }

  function renderCard() {
    elements.roundLabel.textContent = `Партия ${state.roundNumber}`;
    elements.playerProgress.textContent =
      `Игрок ${state.currentPlayer} из ${state.players}`;
    elements.playerNumber.textContent = state.currentPlayer;
    elements.secretWord.textContent = getWordForCurrentPlayer();

    const completedPlayers =
      state.cardStage === "handoff" ? state.currentPlayer : state.currentPlayer - 1;
    elements.progressBar.style.width =
      `${Math.max(0, completedPlayers / state.players) * 100}%`;

    const isClosed = state.cardStage === "closed";
    const isRevealed = state.cardStage === "revealed";
    const isHandoff = state.cardStage === "handoff";

    elements.secretCard.classList.toggle("hidden", isHandoff);
    elements.handoffPanel.classList.toggle("hidden", !isHandoff);
    elements.closedContent.classList.toggle("hidden", !isClosed);
    elements.revealedContent.classList.toggle("hidden", !isRevealed);
    elements.secretCard.classList.toggle("revealed", isRevealed);

    if (isHandoff) {
      elements.handoffText.textContent =
        state.currentPlayer < state.players
          ? `Передайте телефон игроку ${state.currentPlayer + 1}`
          : "Последняя карточка закрыта";
    }

    saveState();
  }

  function advanceCardStage() {
    if (state.screen !== "card") return;

    if (state.cardStage === "closed") {
      state.cardStage = "revealed";
      renderCard();
      return;
    }

    if (state.cardStage === "revealed") {
      state.cardStage = "handoff";
      renderCard();

      if (state.currentPlayer === state.players) {
        setTimeout(showCompleteScreen, 300);
      }
    }
  }

  function nextPlayer() {
    if (state.currentPlayer >= state.players) {
      showCompleteScreen();
      return;
    }

    state.currentPlayer += 1;
    state.cardStage = "closed";
    renderCard();
  }

  function showCompleteScreen() {
    state.cardStage = "complete";
    state.screen = "complete";
    elements.completeRound.textContent = state.roundNumber;
    elements.usedCount.textContent =
      `${state.usedPairIds.length} из ${window.wordPairs.length}`;
    saveState();
    showScreen("complete");
  }

  function openEndModal() {
    elements.modal.classList.remove("hidden");
  }

  function closeEndModal() {
    elements.modal.classList.add("hidden");
  }

  function endGame() {
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    closeEndModal();
    renderSettings();
    showScreen("home");
  }

  function restoreInterface() {
    renderSettings();

    if (!state.sessionActive) {
      showScreen(state.screen === "settings" ? "settings" : "home");
      return;
    }

    if (state.screen === "card" && state.currentPairId) {
      renderCard();
      showScreen("card");
      return;
    }

    if (state.screen === "complete") {
      elements.completeRound.textContent = state.roundNumber;
      elements.usedCount.textContent =
        `${state.usedPairIds.length} из ${window.wordPairs.length}`;
      showScreen("complete");
      return;
    }

    showScreen("settings");
  }

  elements.startGame.addEventListener("click", () => {
    state.sessionActive = false;
    state.screen = "settings";
    renderSettings();
    showScreen("settings");
  });

  elements.playersMinus.addEventListener("click", () => changePlayers(-1));
  elements.playersPlus.addEventListener("click", () => changePlayers(1));
  elements.spiesMinus.addEventListener("click", () => changeSpies(-1));
  elements.spiesPlus.addEventListener("click", () => changeSpies(1));
  elements.deal.addEventListener("click", startRound);

  elements.secretCard.addEventListener("click", advanceCardStage);
  elements.secretCard.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      advanceCardStage();
    }
  });

  elements.secretCard.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true }
  );

  elements.secretCard.addEventListener(
    "touchend",
    (event) => {
      if (touchStartX === null || touchStartY === null) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;

      touchStartX = null;
      touchStartY = null;

      if (Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY)) {
        event.preventDefault();
        advanceCardStage();
      }
    },
    { passive: false }
  );

  elements.readyNext.addEventListener("click", nextPlayer);
  elements.nextRound.addEventListener("click", startRound);

  elements.changeSettings.addEventListener("click", () => {
    renderSettings();
    showScreen("settings");
  });

  elements.endGame.addEventListener("click", openEndModal);
  elements.settingsEnd.addEventListener("click", openEndModal);
  elements.confirmEnd.addEventListener("click", endGame);
  elements.cancelEnd.addEventListener("click", closeEndModal);
  elements.modal.querySelector(".modal-backdrop").addEventListener("click", closeEndModal);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.screen === "card" && state.cardStage === "revealed") {
      state.cardStage = "closed";
      renderCard();
    }
  });

  restoreInterface();
})();
