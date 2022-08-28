const ANIMATION_WAIT = 100;
const WAIT_TIMEOUT = 10000;

const ALERT_WAIT_TIMEOUT = 350*8 /* max reveal delay */ + 500;
const ALERT_POLL_DELAY = 25;

const SETTINGS_ALERT_WAIT_TIMEOUT = 200;

export const ALERT_TYPE_GUESS = "guess";
export const ALERT_TYPE_GAME_END = "game_end";
export const ALERT_TYPE_SETTING = "setting";
export const ALERT_STATUS_SUCCESS = "success";
export const ALERT_STATUS_ERROR = "error";
export const GAME_MODE_DAILY = "daily";
export const GAME_MODE_UNLIMITED = "unlimited";

export const GAME_SETTING_DARK = "dark";
export const GAME_SETTING_HARD = "hard";
export const GAME_SETTING_EXPERT = "expert";
export const GAME_SETTING_HIGH_CONTRAST = "highcontrast";
export const GAME_SETTING_GAME = "game";

const GUESSERS_ID = 'guessers';

const HIGH_CONTRAST_KEY = 'highContrast'
const HARD_MODE_KEY = 'gameMode' // don't modify even though this is confusing
const EXPERT_MODE_KEY = 'expertMode'
const THEME_KEY = 'theme'
const GUESSERS_KEY = 'guessers';
const GAME_STATE_KEY = 'gameState';

const SETTINGS = new Set([GAME_SETTING_DARK,
                  GAME_SETTING_HARD,
                  GAME_SETTING_EXPERT,
                  GAME_SETTING_HIGH_CONTRAST,
                  GAME_SETTING_GAME]);


const INACTIVITY_MILLIS = 1000*60*5; // 5 minutes of inactivity

export const wait = async (millis: number) => {
  return new Promise<void>((resolve, reject) => {
        setTimeout(() => resolve(), millis);
  });
};

type AlertData = {
  message: string
  status?: string
  type?: string
}

type GameState = {
  gameMode: string
  solution: string
}


const keypress = async (args: {key?: string, keyCode?: number, code?: string}) => {
  window.dispatchEvent(new KeyboardEvent('keydown', args));
  return wait(ANIMATION_WAIT);
};

const click = async (el: Node) => {
    if((el as HTMLElement).click) {
      (el as HTMLElement).click();
    } else {
      el.dispatchEvent(new PointerEvent("click", {"bubbles":true}));
    }
    return wait(ANIMATION_WAIT);
};

const waitIdIsPresent = async (id: string) => {
  let el;
  let totalWait = 0;
  while(totalWait < WAIT_TIMEOUT) {
    const el = document.getElementById(id);
    if(el) {
      return el
    }
    await wait(ANIMATION_WAIT)
    totalWait += ANIMATION_WAIT
  }
  throw new Error(`timed out waiting for ${id}`)
}


const clickById = async (id: string) => {
    const el = document.getElementById(id)
    if(!el) {
      return false;
    }
    await click(el)
    return true;
}

const Guesser = (guesser: string) => `<div class="h-14 mx-0.5 mb-1 flex items-center justify-end text-xl title text-black dark:text-white">${guesser}</div>`;

const Guessers = (guessers: string[]) => {
  return guessers.map((g: string) => Guesser(g)).join('');
}

export class Game {
  guessers: string[] = []
  lastActionTimestamp = 0  
  constructor() {}

  async init() {
    const guessers = await this.getStoredGuessers();
    const guessedRows = document.querySelectorAll('[aria-label="guessed row"]');
    if(guessers && guessers.length === guessedRows.length) {
      this.setStoredGuessers(guessers);
    } else {
      await this.refresh();
    }
    this.updateLastActionTimestamp()
  }

  updateLastActionTimestamp() {
    this.lastActionTimestamp = Date.now();
  }

  isInactive() {
    return (Date.now() - this.lastActionTimestamp) > INACTIVITY_MILLIS;
  }

  setStoredGuessers(guessers: string[]) {
    chrome.storage.sync.set({[GUESSERS_KEY]: guessers});
  }

  async getStoredGuessers() {
    return (await chrome.storage.sync.get([GUESSERS_KEY]))[GUESSERS_KEY];
  }

  async setGuessers(guessers: string[]){
    this.guessers = guessers;
    this.setStoredGuessers(this.guessers);
    await this.renderGuessers()
  }

  async addGuesser(guesser: string) {
    this.guessers.push(guesser);
    await this.setGuessers(this.guessers);
  }

  async removeLastGuesser() {
    this.guessers.pop();
    await this.setGuessers(this.guessers);
  }


  // external action
  async guess(word: string, guesser?: string) {
    this.updateLastActionTimestamp();
    if(word.length < this.wordLength()) {
      return {message: 'Not enough letters', type: ALERT_TYPE_GUESS, status: ALERT_STATUS_ERROR} 
    }
    if(word.length > this.wordLength()) {
      return {message: 'Too many letters', type: ALERT_TYPE_GUESS, status: ALERT_STATUS_ERROR} 
    }
    if(guesser) {
      await this.addGuesser(guesser)
    }
    for(let i = 0; i < word.length; i++){
      await keypress({key: word[i]});
    }
    await keypress({keyCode: 13, code: 'Enter'});
    await wait(100) // wait so they can see it typed
    const msg = await this.waitForAlert()
    if(msg) {
      // either game over OR we got an error based on this guess
      await this.clearGuess()
      await this.removeLastGuesser()
      return msg
    }
    return {message: 'Valid guess', type: ALERT_TYPE_GUESS, status: ALERT_STATUS_SUCCESS} 
  }

  async renderGuessers() {
    let guessers = document.getElementById(GUESSERS_ID);
    if(!guessers) {
      const root = document.getElementById('root');
      if(!root) {
        throw new Error('no root element');
      }
      root.style.position = 'relative';
      guessers = document.createElement('div');
      guessers.setAttribute('id', GUESSERS_ID);
      guessers.style.position = 'absolute';
      guessers.style.paddingRight = '1rem';
      guessers.style.width = '200px';
      root.appendChild(guessers);
    }

    const firstCell = document.querySelector('.cell');
    if(!firstCell) {
        throw new Error('no cell element');
    }
    const boundingBox = firstCell.getBoundingClientRect();

    guessers.style.left = (boundingBox.x - 200).toString() + "px";
    guessers.style.top = boundingBox.y.toString() + "px";
    guessers.innerHTML = Guessers(this.guessers)
  }

  wordLength() {
    const length = document.querySelector('[aria-label="puzzle"]')?.childElementCount
    if(!length) {
      console.log('error fetching word length');
      return 0;
    }
    return length;
  }

  async clearGuess() {
    for(let i = 0; i < 8; i++){
      await keypress({keyCode: 8, code: 'Backspace'});
    }
  }

  async refresh() {
    await this.setGuessers([]);
    return await clickById('nav-btn-refresh');
  }

	gameMode() {
		return document.location.pathname === '/' ? GAME_MODE_DAILY : GAME_MODE_UNLIMITED;
	}

	async openSettings() {
    return await clickById('nav-btn-settings');
	}

	async getShareMessage() {
    let el = await waitIdIsPresent('stats-share');
    return el.dataset.shareText || '';
	}

	async nextPuzzle() {
    let el = await waitIdIsPresent('stats-next-puzzle');
    await click(el);
    return await this.setGuessers([]);
	}

	async closeSettings() {
    return await keypress({key: 'Escape'});
	}

  // external action
  async currentSettings() {
    this.updateLastActionTimestamp();
    return {
      hard: (await localStorage.getItem(HARD_MODE_KEY) || '') ===  GAME_SETTING_HARD,
      expert: (await localStorage.getItem(EXPERT_MODE_KEY) || '') ===  GAME_SETTING_EXPERT,
      dark: (await localStorage.getItem(THEME_KEY) || '') ===  GAME_SETTING_DARK,
      highcontrast: (await localStorage.getItem(HIGH_CONTRAST_KEY) || '') ===  '1',
    }
  }

  solution() {
    const gameState = JSON.parse(localStorage.getItem(GAME_STATE_KEY) || '') || [] as GameState[];
    return gameState.find((g: GameState) => g.gameMode === 'Unlimited').solution
  }

  // external action
  async toggle(mode: string) {
    this.updateLastActionTimestamp();
    if(!SETTINGS.has(mode)) {
      return false // unknown mode
    }
    await this.openSettings();
    let el = await waitIdIsPresent(`settings-${mode}-mode`)
    if(mode === GAME_SETTING_GAME) {
      let btn = document.querySelector('#settings-game-mode [aria-current="false"]') as HTMLElement;
      if(btn) {
        el = btn;
      } else {
        return false;
      }
    }
    await wait(300);
    await click(el);
    await this.closeSettings(); 
    return await this.waitForAlert(SETTINGS_ALERT_WAIT_TIMEOUT);
  }

  async waitForAlert(timeout=ALERT_WAIT_TIMEOUT) {
    let el;
    let totalWait = 0;
    while(totalWait < timeout) {
      const el = document.querySelector('[role="alert"]') as HTMLElement
      if(el) {
        return {message: el.textContent || '', type: el.dataset.type, status: el.dataset.status} as AlertData
      }
      await wait(ALERT_POLL_DELAY)
      totalWait += ALERT_POLL_DELAY
    }
    return false
  }
}
