const ANIMATION_WAIT = 100;
const WAIT_TIMEOUT = 10000;

const ALERT_WAIT_TIMEOUT = 350*8 /* max reveal delay */ + 500;
const ALERT_POLL_DELAY = 25;
const wait = async (millis: number) => {
  return new Promise<void>((resolve, reject) => {
        setTimeout(() => resolve(), millis);
  });
};

type AlertData = {
  message: string
  status?: string
  type?: string
}

const ALERT_TYPE_GUESS = "guess";
const ALERT_STATUS_SUCCESS = "success";
const ALERT_STATUS_ERROR = "error";

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


class Game {

  constructor() {}

  async guess(word: string) {
    for(let i = 0; i < word.length; i++){
      await keypress({key: word[i]});
    }
    await keypress({keyCode: 13, code: 'Enter'});
    await wait(100) // wait so they can see it typed
    const msg = await this.waitForAlert()
    if(msg) {
      // either game over OR we got an error based on this guess
      await this.clearGuess()
      return msg
    }
    return {message: 'Valid guess', type: ALERT_TYPE_GUESS, status: ALERT_STATUS_SUCCESS} 
  }

  async clearGuess() {
    for(let i = 0; i < 8; i++){
      await keypress({keyCode: 8, code: 'Backspace'});
    }
  }

  refresh() {
    return clickById('nav-btn-refresh');
  }

	gameMode() {
		return document.location.pathname === '/' ? 'daily' : 'unlimited' ;
	}

	async openSettings() {
    return await clickById('nav-btn-settings');
	}


	async getShareMessage() {
    let el = await waitIdIsPresent('stats-share');
    await click(el);
    return await navigator.clipboard.readText();
	}

	async nextPuzzle() {
    let el = await waitIdIsPresent('stats-next-puzzle');
    return await click(el);
	}

	async closeSettings() {
    return await keypress({key: 'Escape'});
	}

  async toggle(mode: string) {
    let el = await waitIdIsPresent(`settings-${mode}-mode`)
    if(mode === 'game') {
      let btn = document.querySelector('#settings-game-mode [aria-current="false"]') as HTMLElement;
      if(btn) {
        el = btn;
      } else {
        return false;
      }
    }
    await wait(300);
    return await click(el);
  }

  async waitForAlert() {
    let el;
    let totalWait = 0;
    while(totalWait < ALERT_WAIT_TIMEOUT) {
      const el = document.querySelector('[role="alert"]') as HTMLElement
      if(el) {
        return {message: el.textContent || '', type: el.dataset.type, status: el.dataset.status} as AlertData
      }
      await wait(ALERT_POLL_DELAY)
      totalWait += ALERT_POLL_DELAY
    }
    return false
  }

  // next puzzle
  // share
}


window.addEventListener('load', async () => {
  const g = new Game();
  console.log(await g.getShareMessage());
  console.log('next...');
  console.log(await g.nextPuzzle());
  //let msg
  //msg = await g.guess('hello')
  //console.log(JSON.stringify(msg))
  //msg = await g.guess('sunshine')
  //console.log(JSON.stringify(msg))
  //msg = await g.guess('sunshine')
  //console.log(JSON.stringify(msg))
})
