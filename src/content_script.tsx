import {config} from './config'
import tmi from 'tmi.js'

const ANIMATION_WAIT = 100;
const WAIT_TIMEOUT = 10000;

const ALERT_WAIT_TIMEOUT = 350*8 /* max reveal delay */ + 500;
const ALERT_POLL_DELAY = 25;
const JOB_POLL_DELAY = 1000;

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
const ALERT_TYPE_GAME_END = "game_end";
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
}

//window.addEventListener('load', async () => {
//  const g = new Game();
//  console.log(await g.getShareMessage());
//  console.log('next...');
//  console.log(await g.nextPuzzle());
//  //let msg
//  //msg = await g.guess('hello')
//  //console.log(JSON.stringify(msg))
//  //msg = await g.guess('sunshine')
//  //console.log(JSON.stringify(msg))
//  //msg = await g.guess('sunshine')
//  //console.log(JSON.stringify(msg))
//})
type RunArgs = {
  args: string[]
  userState: tmi.Userstate
}

type Job = {
  command: Command
  runArgs: RunArgs
}

type CommandArgs = {
  client: tmi.Client
  game: Game
  name: string
  isInteractive: boolean
  alias?: string
}

abstract class Command {

  client: tmi.Client
  game: Game
  name: string
  isInteractive: boolean
  alias?: string

  constructor(readonly args: CommandArgs) {
    this.client = args.client
    this.game = args.game
    this.name = args.name
    this.isInteractive = args.isInteractive
    this.alias = args.alias
  }

  async say(msg: string) {
    return await this.client.say(config.TWITCH_CHANNEL, msg)
  }

  abstract run(args: RunArgs): void 
}

class Hello extends Command {
  async run({userState, args}: RunArgs) {
    this.say(`hey ${userState.username}!`)
  }
}

class Discord extends Command {
  async run({userState, args}: RunArgs) {
    await this.say('Join the Polygonle community at https://discord.com/invite/TrVJMwzjKc')
  }
}

class Twitter extends Command {
  async run({userState, args}: RunArgs) {
    await this.say('Follow us at https://twitter.com/PolygonleGame')
  }
}

class Guess extends Command {
  async run({userState, args}: RunArgs) {
    if(args.length === 0) {
      return await this.say(`${userState.username} Couldn\'t find your guess. Usage: !guess yourword`)
    }
    if(args.length > 1) {
      return await this.say(`${userState.username} Please guess only one word at a time!. Usage: !guess yourword`)
    }
    // TODO check word length
    const result = await this.game.guess(args[0]);
    if(result.type === ALERT_TYPE_GUESS && result.status === ALERT_STATUS_ERROR) {
      return await this.say(`${userState.username} ${result.message}`)
    }
    if(result.type === ALERT_TYPE_GAME_END) {

    }
    console.log(JSON.stringify(result));
  }
}


//  !howtoplay
//  !settings
//  !wordlist
//
//  !guess
//  !g (alias)
//  !toggle setting name

let allValidCommands: Set<string> = new Set([]);
class ListCommands extends Command {
  async run({userState, args}: RunArgs) {
    await client.say(config.TWITCH_CHANNEL, [...allValidCommands].join(', '))
  }
}




const client = new tmi.Client({
	options: { debug: true },
	identity: {
		username: config.TWITCH_USERNAME,
		password: config.TWITCH_OAUTH
	},
	channels: [ config.TWITCH_CHANNEL ]
});

const game = new Game()

const commands = [
  new Hello({client, game, name: 'hello', isInteractive: false}),
  new Discord({client, game, name: 'discord', isInteractive: false}),
  new Twitter({client, game, name: 'twitter', isInteractive: false}),
  new ListCommands({client, game, name: 'commands', isInteractive: false}),
  new Guess({client, game, name: 'guess', isInteractive: true, alias: 'g'})
];

const toBang = (name: string) => `!${name}`;
const nameToCommands = new Map();
commands.forEach((c) => {
  nameToCommands.set(toBang(c.name), c)
  if(c.alias) {
    nameToCommands.set(toBang(c.alias), c)
  }
})

allValidCommands = new Set(nameToCommands.keys());

client.connect();


const jobs: Job[] = [];
client.on('message', (channel: string, userState: tmi.Userstate, message: string, self: boolean) => {
	// Ignore echoed messages.
	if(self) return;

	const commandParts = message.split(' ')
	if(commandParts.length > 0 && commandParts[0].startsWith('!')) {
    const command = nameToCommands.get(commandParts[0])
    if(!command) {
		  client.say(channel, 'Unknown command. Type !commands to list all available commands');
      return;
    }
    const args = commandParts.slice(1)
    const runArgs = {userState, args};
    if(!(command!.isInteractive)) {
      // commands which don't interact with the game state can be run immediately.
      command!.run(runArgs)
    } else {
      // commands which interact with the game need to be processed by processJobs below.
      jobs.push({runArgs, command: command!})
    }
  }
});

const processJobs = async () => {
  if(jobs.length === 0) {
    return await wait(JOB_POLL_DELAY)
  }
  const next = jobs.shift()! //dequeue
  return await next.command.run(next.runArgs)
}

//setInterval()
while(true) {
  await processJobs()
}


// game loop waiting for new comments
// !music command?
// package everything in a private browser somehow that doesn't bother my normal usage of the pc

