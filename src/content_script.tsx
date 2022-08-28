import {config} from './config'
import {
  Game,
  wait,
  ALERT_TYPE_GUESS,
  ALERT_TYPE_GAME_END,
  ALERT_TYPE_SETTING,
  ALERT_STATUS_SUCCESS,
  ALERT_STATUS_ERROR,
  GAME_MODE_DAILY,
  GAME_SETTING_GAME,
} from './game'
import tmi from 'tmi.js'

const JOB_POLL_DELAY = 100;

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

class HowToPlay extends Command {
  async run({userState, args}: RunArgs) {
    await this.say('Guess the word in 6 tries. Each shape corresponds to a specific letter in the hidden word. Make a guess with !guess yourguesshere.')
  }
}

class WordList extends Command {
  async run({userState, args}: RunArgs) {
    await this.say('Polygonle uses the SOWPODS word list: https://www.wordgamedictionary.com/sowpods/')
  }
}

class Music extends Command {
  async run({userState, args}: RunArgs) {
    await this.say('https://www.youtube.com/user/Chillhopdotcom')
  }
}

class Code extends Command {
  async run({userState, args}: RunArgs) {
    await this.say('https://github.com/Grantismo/twitchplayspolygonle')
  }
}

class ExplainSettings extends Command {
  async run({userState, args}: RunArgs) {
    await this.say('hard mode: Any revealed hints must be used in subsequent guesses.')
    await this.say('expert mode: All guesses must match the pattern of the shapes. WARNING: this may be incredibly difficult for some puzzles.')
    await this.say('dark mode: Dark background and light text.')
    await this.say('highcontrast mode: For improved color vision.')
  }
}

class Settings extends Command {
  async run({userState, args}: RunArgs) {
    const settings = await this.game.currentSettings();
    await this.say(Object.entries(settings).map(([k, v]: [string, boolean]) => `${k}: ${v? 'on': 'off'}`).join(', '))
  }
}


class Guess extends Command {
  async run({userState, args}: RunArgs) {
    if(args.length === 0) {
      return await this.say(`${userState.username} Couldn\'t find your guess. Usage: !guess yourword`);
    }
    if(args.length > 1) {
      return await this.say(`${userState.username} Please guess only one word at a time!. Usage: !guess yourword`);
    }
    const result = await this.game.guess(args[0], userState.username);
    if(result.type === ALERT_TYPE_GUESS && result.status === ALERT_STATUS_ERROR) {
      return await this.say(`${userState.username} ${result.message}`);
    }
    if(result.type === ALERT_TYPE_GAME_END) {
      await this.say(`${userState.username} ${result.message}`);
      const shareMessage = await this.game.getShareMessage();
      if(shareMessage) {
        const lines = shareMessage.split("\n")
        lines.forEach(async (l: string) => {
          await this.say(l);
        })
      }
      return await this.game.nextPuzzle();
    }
  }
}

class Refresh extends Command {
  async run({userState, args}: RunArgs) {
    const guessers = new Set(this.game.guessers); 
    const isOnlyGuesser = guessers.size == 1 && guessers.has(userState.username);
    if(this.game.isInactive() || isOnlyGuesser) {
      return await this.game.refresh()
    } else {
      return await this.say(`${userState.username} can't refresh while others are guessing`);
    }
  }
}

const SUPPORTED_TOGGLE_SETTINGS = ['hard', 'expert', 'dark', 'highcontrast']
class Toggle extends Command {
  async run({userState, args}: RunArgs) {
    if(args.length === 0 || args.length > 1) {
      return await this.say(`${userState.username} Usage: !toggle settingname. Supported settings: ${SUPPORTED_TOGGLE_SETTINGS.join(', ')}`);
    }
    if(!(SUPPORTED_TOGGLE_SETTINGS.includes(args[0]))) {
      return await this.say(`${userState.username} Unknown setting. Supported settings: ${SUPPORTED_TOGGLE_SETTINGS.join(', ')}`);
    }
    const result = await this.game.toggle(args[0])
    if(result && result.type === ALERT_TYPE_SETTING && result.status === ALERT_STATUS_ERROR) {
      return await this.say(`${userState.username} ${result.message}`);
    }
  }
}

const commandsString = (commands: Command[]) => {
  return commands.map((c: Command ) => c.alias ? `!${c.name} or !${c.alias}` : `!${c.name}`).join(', ');
};

class ListCommands extends Command {

  public allCommands: Command[] = [];

  async run({userState, args}: RunArgs) {
    const generalCommands = commandsString(this.allCommands.filter(c => !c.isInteractive));
    const gameCommands = commandsString(this.allCommands.filter(c => c.isInteractive));
    return await this.say(`General commands: ${generalCommands}. Game commands: ${gameCommands}`);
  }
}

// TODO LIST
//
// features:
// 3. tutorial via chat rules
// 4. scoreboard -- determine how to award points
// 5. avatars

async function main() {
  const client = new tmi.Client({
  	options: { debug: true },
  	identity: {
  		username: config.TWITCH_USERNAME,
  		password: config.TWITCH_OAUTH
  	},
  	channels: [ config.TWITCH_CHANNEL ]
  });
  
  const game = new Game()
  
  const listCommands = new ListCommands({client, game, name: 'commands', isInteractive: false});
  const commands = [
    new Hello({client, game, name: 'hello', isInteractive: false}),
    new Discord({client, game, name: 'discord', isInteractive: false}),
    new Twitter({client, game, name: 'twitter', isInteractive: false}),
    new HowToPlay({client, game, name: 'howtoplay', isInteractive: false}),
    new WordList({client, game, name: 'wordlist', isInteractive: false}),
    new ExplainSettings({client, game, name: 'explainsettings', isInteractive: false}),
    new Music({client, game, name: 'music', isInteractive: false}),
    new Music({client, game, name: 'code', isInteractive: false}),
    new Settings({client, game, name: 'settings', isInteractive: false}),
    new Refresh({client, game, name: 'refresh', isInteractive: true, alias: 'r'}),
    new Guess({client, game, name: 'guess', isInteractive: true, alias: 'g'}),
    new Toggle({client, game, name: 'toggle', isInteractive: true}),
    listCommands,
  ];
  listCommands.allCommands = commands;
  
  const toBang = (name: string) => `!${name}`;
  const nameToCommands = new Map();
  commands.forEach((c) => {
    nameToCommands.set(toBang(c.name), c)
    if(c.alias) {
      nameToCommands.set(toBang(c.alias), c)
    }
  })

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
      if(game.isInactive()) {
        const solution = game.solution();
        await game.guess(solution);
        await client.say(config.TWITCH_CHANNEL, `The solution was ${solution}`)
        await game.nextPuzzle();
      }

      return await wait(JOB_POLL_DELAY)
    }
    const next = jobs.shift()! //dequeue
    return await next.command.run(next.runArgs)
  }
  

  window.onload = async () => {
    if(game.gameMode() === GAME_MODE_DAILY) {
      await game.toggle(GAME_SETTING_GAME)
    }
    await game.init()

    while(true) {
      await processJobs()
    }
  }
};

if((new URLSearchParams(window.location.search)).has('twitch')) {
  main();
}
