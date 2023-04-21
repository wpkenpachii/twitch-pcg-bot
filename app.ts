const input = require('input')
const fs = require('fs');
import tmi from 'tmi.js'

const rawdata = fs.readFileSync('settings.json');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function removeAcento (text: string)
{       
    text = text.toLowerCase();                                                         
    text = text.replace(new RegExp('[ÁÀÂÃ]','gmi'), 'a');
    text = text.replace(new RegExp('[ÉÈÊ]','gmi'), 'e');
    text = text.replace(new RegExp('[ÍÌÎ]','gmi'), 'i');
    text = text.replace(new RegExp('[ÓÒÔÕ]','gmi'), 'o');
    text = text.replace(new RegExp('[ÚÙÛ]','gmi'), 'u');
    text = text.replace(new RegExp('[Ç]','gmi'), 'c');
    return text;                 
}

const tiers_json = get_tiers();
let channel_lang: "ptbr" | "eng" | string = "eng";
async function askPreferences(): Promise<void> {
  let token: string;
  let channel: string;
  let pcg_user: string;

  const getEnvFrom = (await input.select('How do you want to configure the bot?', ['terminal input', 'settings.json file'], {
    default: "settings.json file"
  }))

  if (getEnvFrom === 'settings.json file') {
    const { CHANNEL_TO_LISTEN, CHANNEL_LANG, PCG_USER, TWITCH_OAUTH_TOKEN } = JSON.parse(rawdata);
    token = TWITCH_OAUTH_TOKEN as string;
    channel_lang = CHANNEL_LANG as string || "eng";
    channel = CHANNEL_TO_LISTEN as string;
    pcg_user = PCG_USER as string;
    console.log('Settings File Payload:', { CHANNEL_TO_LISTEN, CHANNEL_LANG, PCG_USER, TWITCH_OAUTH_TOKEN })
  } else {
    token = (await input.text("You twitch oauth token:"))
    channel_lang = (await input.select("Chat Language:", ["ptbr", "eng"], { default: "eng" }))
    channel = (await input.text("Chat to Listen:"))
    pcg_user = (await input.text("PCG username:", { default: "PokemonCommunityGame"}))
    console.log("Settings from Input:", { token, channel_lang, channel, pcg_user })
  }
  

  //INITIALIZING
  if (channel) {
      const client = new tmi.Client({
          options: { debug: false },
          identity: {
              username: 'anyone',
              password: token as string
          },
          channels: [channel],
      });
      client.connect().then(() => {
          console.log('Bot connected in following chats', [channel]);
          console.log('To stop the bot, close the terminal or use ctrl + c');
          console.log('Settings', {
              "Chat": channel,
              "PcgUser": pcg_user
          })
      }).catch((err: any) => {
          if (err.message.match('No response from Twitch')) {
              console.log('Missing or Invalid Token')
          }
      });

      // LISTENING
      client.on('message', async (channel, tags, message, self) => {
        if(self) return;
        if (tags.username!.toLocaleLowerCase() === pcg_user.toLocaleLowerCase()) {
          const _msg = channel_lang === 'ptbr' ? 'Tente capturar usando !pokecatch' : 'Catch it using !pokecatch'
          if (message.match(_msg)) {
            console.log(message)
            const pokemonName = getPokemonNameFromRawMessage(message);
            console.log(pokemonName, 'appeared!')
            if (!pokemonName) return
            const pokemon = getPokemonFromName(pokemonName);
            console.log('Info:', pokemon);
            client.say(channel, '!pokecheck')
            const pokeball = riskAndRewardEvaluation(pokemonName, pokemon.Tier.toUpperCase())
            if (pokeball === 'skip') {
              console.log('This pokemon has a tier lower than B ')
            } else {
              console.log('Pokeball to be used:', pokeball);
              await sleep(1200)
              client.say(channel, `!pokeshop ${pokeball}`).then(async () => {
                console.log(`!pokeshop ${pokeball}`)
                await sleep(1200)
                client.say(channel, `!pokecatch ${pokeball}`).then(() => {
                  console.log(`!pokecatch ${pokeball}`)
                })
              });
            }
            console.log('===============================================================')
          }
        }
      });
  } else {
      console.log('Tem que escolher o canal jumento...')
      askPreferences()
  }
}

type Pokemon = {
  Name: string,
  "Pokedex ID": number,
  "Pokemon Order": number,
  Tier: string,
  "Base Stats Total": number,
  Generation: number
}

const tiers: {
  [key: string]: {max: number, min: number}
} = {
  Starter: {max: 0, min: 0},
  S: {max: 0, min: 0},
  A: {max: 0, min: 0},
  B: {max: 0, min: 0},
  C: {max: 0, min: 0},
}

function getPokemonStats(tier: string) {
  const _tiers = tiers_json.map((_tier: Pokemon) => {
    if (_tier.Tier !== tier) return
    return _tier["Base Stats Total"]
  })

  return {
    max: Math.max(..._tiers),
    min: Math.min(..._tiers),
  }
}

function getPokemonNameFromRawMessage(rawMessage: string) {
  const regex = channel_lang === 'ptbr' ? new RegExp('(?<=TwitchLit\\sum|uma)\\s([a-zA-Zà-úÀ-Ú0-9]+)', 'gmi') : new RegExp('(?<=TwitchLit\\sa\\swild\\s)([a-zA-Zà-úÀ-Ú0-9]+)', 'gmi')
  const match = rawMessage.match(regex);
  return match && match[0].trim();
}

function getPokemonFromName(pokemonName: string): Pokemon {
  const pokemon = tiers_json.find((pokemon: Pokemon) => {
    console.log('Fromlist:', pokemon.Name.toLowerCase())
    console.log('FromMessage:', (removeAcento(pokemonName)).toLowerCase())
    if (pokemon.Name.toLowerCase() === (removeAcento(pokemonName)).toLowerCase()) {
      return pokemon
    }
  })
  if (!pokemon) throw new Error('Pokemon not found')
  return pokemon
}

function riskAndRewardEvaluation(pokemonName: string, tier: string): string {
  if (!pokemonName) return 'skip'
  const pokemon = getPokemonFromName(pokemonName);
  if (["STARTER", "S"].includes(tier)) {
    return 'ultraball'
  } else if (["A", "B"].includes(tier) && pokemon["Base Stats Total"] >= 500) {
    return 'ultraball'
  } else if (["A", "B"].includes(tier) && pokemon["Base Stats Total"] >= 450) {
    return 'greatball'
  } else if (["B"].includes(tier) && pokemon["Base Stats Total"] >= 400) {
    return 'pokeball'
  }
  return 'skip'
}

tiers_json.forEach((tier: Pokemon) => {
  tiers[`${tier.Tier}`].max = getPokemonStats(tier.Tier).max
  tiers[`${tier.Tier}`].min = getPokemonStats(tier.Tier).min
})

function get_tiers() {
  return JSON.parse(`[
        {
          "Name": "bulbasaur",
          "Pokedex ID": 1,
          "Pokemon Order": 1,
          "Tier": "Starter",
          "Base Stats Total": 318,
          "Generation": 1
        },
        {
          "Name": "ivysaur",
          "Pokedex ID": 2,
          "Pokemon Order": 2,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 1
        },
        {
          "Name": "venusaur",
          "Pokedex ID": 3,
          "Pokemon Order": 3,
          "Tier": "Starter",
          "Base Stats Total": 525,
          "Generation": 1
        },
        {
          "Name": "charmander",
          "Pokedex ID": 4,
          "Pokemon Order": 4,
          "Tier": "Starter",
          "Base Stats Total": 309,
          "Generation": 1
        },
        {
          "Name": "charmeleon",
          "Pokedex ID": 5,
          "Pokemon Order": 5,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 1
        },
        {
          "Name": "charizard",
          "Pokedex ID": 6,
          "Pokemon Order": 6,
          "Tier": "Starter",
          "Base Stats Total": 534,
          "Generation": 1
        },
        {
          "Name": "squirtle",
          "Pokedex ID": 7,
          "Pokemon Order": 7,
          "Tier": "Starter",
          "Base Stats Total": 314,
          "Generation": 1
        },
        {
          "Name": "wartortle",
          "Pokedex ID": 8,
          "Pokemon Order": 8,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 1
        },
        {
          
          "Name": "blastoise",
          "Pokedex ID": 9,
          "Pokemon Order": 9,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 1
        },
        {
          
          "Name": "caterpie",
          "Pokedex ID": 10,
          "Pokemon Order": 10,
          "Tier": "C",
          "Base Stats Total": 195,
          "Generation": 1
        },
        {
          
          "Name": "metapod",
          "Pokedex ID": 11,
          "Pokemon Order": 11,
          "Tier": "C",
          "Base Stats Total": 205,
          "Generation": 1
        },
        {
          
          "Name": "butterfree",
          "Pokedex ID": 12,
          "Pokemon Order": 12,
          "Tier": "B",
          "Base Stats Total": 395,
          "Generation": 1
        },
        {
          
          "Name": "weedle",
          "Pokedex ID": 13,
          "Pokemon Order": 13,
          "Tier": "C",
          "Base Stats Total": 195,
          "Generation": 1
        },
        {
          
          "Name": "kakuna",
          "Pokedex ID": 14,
          "Pokemon Order": 14,
          "Tier": "C",
          "Base Stats Total": 205,
          "Generation": 1
        },
        {
          
          "Name": "beedrill",
          "Pokedex ID": 15,
          "Pokemon Order": 15,
          "Tier": "B",
          "Base Stats Total": 395,
          "Generation": 1
        },
        {
          
          "Name": "pidgey",
          "Pokedex ID": 16,
          "Pokemon Order": 16,
          "Tier": "C",
          "Base Stats Total": 251,
          "Generation": 1
        },
        {
          
          "Name": "pidgeotto",
          "Pokedex ID": 17,
          "Pokemon Order": 17,
          "Tier": "B",
          "Base Stats Total": 349,
          "Generation": 1
        },
        {
          
          "Name": "pidgeot",
          "Pokedex ID": 18,
          "Pokemon Order": 18,
          "Tier": "B",
          "Base Stats Total": 479,
          "Generation": 1
        },
        {
          
          "Name": "rattata",
          "Pokedex ID": 19,
          "Pokemon Order": 19,
          "Tier": "C",
          "Base Stats Total": 253,
          "Generation": 1
        },
        {
          
          "Name": "raticate",
          "Pokedex ID": 20,
          "Pokemon Order": 20,
          "Tier": "B",
          "Base Stats Total": 413,
          "Generation": 1
        },
        {
          
          "Name": "spearow",
          "Pokedex ID": 21,
          "Pokemon Order": 21,
          "Tier": "C",
          "Base Stats Total": 262,
          "Generation": 1
        },
        {
          
          "Name": "fearow",
          "Pokedex ID": 22,
          "Pokemon Order": 22,
          "Tier": "B",
          "Base Stats Total": 442,
          "Generation": 1
        },
        {
          
          "Name": "ekans",
          "Pokedex ID": 23,
          "Pokemon Order": 23,
          "Tier": "C",
          "Base Stats Total": 288,
          "Generation": 1
        },
        {
          
          "Name": "arbok",
          "Pokedex ID": 24,
          "Pokemon Order": 24,
          "Tier": "B",
          "Base Stats Total": 448,
          "Generation": 1
        },
        {
          
          "Name": "pikachu",
          "Pokedex ID": 25,
          "Pokemon Order": 25,
          "Tier": "B",
          "Base Stats Total": 320,
          "Generation": 1
        },
        {
          
          "Name": "raichu",
          "Pokedex ID": 26,
          "Pokemon Order": 26,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 1
        },
        {
          
          "Name": "sandshrew",
          "Pokedex ID": 27,
          "Pokemon Order": 27,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 1
        },
        {
          
          "Name": "sandslash",
          "Pokedex ID": 28,
          "Pokemon Order": 28,
          "Tier": "B",
          "Base Stats Total": 450,
          "Generation": 1
        },
        {
          
          "Name": "nidoran-f",
          "Pokedex ID": 29,
          "Pokemon Order": 29,
          "Tier": "C",
          "Base Stats Total": 275,
          "Generation": 1
        },
        {
          
          "Name": "nidorina",
          "Pokedex ID": 30,
          "Pokemon Order": 30,
          "Tier": "B",
          "Base Stats Total": 365,
          "Generation": 1
        },
        {
          
          "Name": "nidoqueen",
          "Pokedex ID": 31,
          "Pokemon Order": 31,
          "Tier": "A",
          "Base Stats Total": 505,
          "Generation": 1
        },
        {
          
          "Name": "nidoran-m",
          "Pokedex ID": 32,
          "Pokemon Order": 32,
          "Tier": "C",
          "Base Stats Total": 273,
          "Generation": 1
        },
        {
          
          "Name": "nidorino",
          "Pokedex ID": 33,
          "Pokemon Order": 33,
          "Tier": "B",
          "Base Stats Total": 365,
          "Generation": 1
        },
        {
          
          "Name": "nidoking",
          "Pokedex ID": 34,
          "Pokemon Order": 34,
          "Tier": "A",
          "Base Stats Total": 505,
          "Generation": 1
        },
        {
          
          "Name": "clefairy",
          "Pokedex ID": 35,
          "Pokemon Order": 35,
          "Tier": "C",
          "Base Stats Total": 323,
          "Generation": 1
        },
        {
          
          "Name": "clefable",
          "Pokedex ID": 36,
          "Pokemon Order": 36,
          "Tier": "B",
          "Base Stats Total": 483,
          "Generation": 1
        },
        {
          
          "Name": "vulpix",
          "Pokedex ID": 37,
          "Pokemon Order": 37,
          "Tier": "C",
          "Base Stats Total": 299,
          "Generation": 1
        },
        {
          
          "Name": "ninetales",
          "Pokedex ID": 38,
          "Pokemon Order": 38,
          "Tier": "B",
          "Base Stats Total": 505,
          "Generation": 1
        },
        {
          
          "Name": "jigglypuff",
          "Pokedex ID": 39,
          "Pokemon Order": 39,
          "Tier": "C",
          "Base Stats Total": 270,
          "Generation": 1
        },
        {
          
          "Name": "wigglytuff",
          "Pokedex ID": 40,
          "Pokemon Order": 40,
          "Tier": "B",
          "Base Stats Total": 435,
          "Generation": 1
        },
        {
          
          "Name": "zubat",
          "Pokedex ID": 41,
          "Pokemon Order": 41,
          "Tier": "C",
          "Base Stats Total": 245,
          "Generation": 1
        },
        {
          
          "Name": "golbat",
          "Pokedex ID": 42,
          "Pokemon Order": 42,
          "Tier": "C",
          "Base Stats Total": 455,
          "Generation": 1
        },
        {
          
          "Name": "oddish",
          "Pokedex ID": 43,
          "Pokemon Order": 43,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 1
        },
        {
          
          "Name": "gloom",
          "Pokedex ID": 44,
          "Pokemon Order": 44,
          "Tier": "B",
          "Base Stats Total": 395,
          "Generation": 1
        },
        {
          
          "Name": "vileplume",
          "Pokedex ID": 45,
          "Pokemon Order": 45,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "paras",
          "Pokedex ID": 46,
          "Pokemon Order": 46,
          "Tier": "C",
          "Base Stats Total": 285,
          "Generation": 1
        },
        {
          
          "Name": "parasect",
          "Pokedex ID": 47,
          "Pokemon Order": 47,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 1
        },
        {
          
          "Name": "venonat",
          "Pokedex ID": 48,
          "Pokemon Order": 48,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 1
        },
        {
          
          "Name": "venomoth",
          "Pokedex ID": 49,
          "Pokemon Order": 49,
          "Tier": "B",
          "Base Stats Total": 450,
          "Generation": 1
        },
        {
          
          "Name": "diglett",
          "Pokedex ID": 50,
          "Pokemon Order": 50,
          "Tier": "C",
          "Base Stats Total": 265,
          "Generation": 1
        },
        {
          
          "Name": "dugtrio",
          "Pokedex ID": 51,
          "Pokemon Order": 51,
          "Tier": "B",
          "Base Stats Total": 425,
          "Generation": 1
        },
        {
          
          "Name": "meowth",
          "Pokedex ID": 52,
          "Pokemon Order": 52,
          "Tier": "C",
          "Base Stats Total": 290,
          "Generation": 1
        },
        {
          
          "Name": "persian",
          "Pokedex ID": 53,
          "Pokemon Order": 53,
          "Tier": "B",
          "Base Stats Total": 440,
          "Generation": 1
        },
        {
          
          "Name": "psyduck",
          "Pokedex ID": 54,
          "Pokemon Order": 54,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 1
        },
        {
          
          "Name": "golduck",
          "Pokedex ID": 55,
          "Pokemon Order": 55,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 1
        },
        {
          
          "Name": "mankey",
          "Pokedex ID": 56,
          "Pokemon Order": 56,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 1
        },
        {
          
          "Name": "primeape",
          "Pokedex ID": 57,
          "Pokemon Order": 57,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 1
        },
        {
          
          "Name": "growlithe",
          "Pokedex ID": 58,
          "Pokemon Order": 58,
          "Tier": "C",
          "Base Stats Total": 350,
          "Generation": 1
        },
        {
          
          "Name": "arcanine",
          "Pokedex ID": 59,
          "Pokemon Order": 59,
          "Tier": "A",
          "Base Stats Total": 555,
          "Generation": 1
        },
        {
          
          "Name": "poliwag",
          "Pokedex ID": 60,
          "Pokemon Order": 60,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 1
        },
        {
          
          "Name": "poliwhirl",
          "Pokedex ID": 61,
          "Pokemon Order": 61,
          "Tier": "B",
          "Base Stats Total": 385,
          "Generation": 1
        },
        {
          
          "Name": "poliwrath",
          "Pokedex ID": 62,
          "Pokemon Order": 62,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 1
        },
        {
          
          "Name": "abra",
          "Pokedex ID": 63,
          "Pokemon Order": 63,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 1
        },
        {
          
          "Name": "kadabra",
          "Pokedex ID": 64,
          "Pokemon Order": 64,
          "Tier": "B",
          "Base Stats Total": 400,
          "Generation": 1
        },
        {
          
          "Name": "alakazam",
          "Pokedex ID": 65,
          "Pokemon Order": 65,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 1
        },
        {
          
          "Name": "machop",
          "Pokedex ID": 66,
          "Pokemon Order": 66,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 1
        },
        {
          
          "Name": "machoke",
          "Pokedex ID": 67,
          "Pokemon Order": 67,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 1
        },
        {
          
          "Name": "machamp",
          "Pokedex ID": 68,
          "Pokemon Order": 68,
          "Tier": "A",
          "Base Stats Total": 505,
          "Generation": 1
        },
        {
          
          "Name": "bellsprout",
          "Pokedex ID": 69,
          "Pokemon Order": 69,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 1
        },
        {
          
          "Name": "weepinbell",
          "Pokedex ID": 70,
          "Pokemon Order": 70,
          "Tier": "B",
          "Base Stats Total": 390,
          "Generation": 1
        },
        {
          
          "Name": "victreebel",
          "Pokedex ID": 71,
          "Pokemon Order": 71,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "tentacool",
          "Pokedex ID": 72,
          "Pokemon Order": 72,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 1
        },
        {
          
          "Name": "tentacruel",
          "Pokedex ID": 73,
          "Pokemon Order": 73,
          "Tier": "B",
          "Base Stats Total": 515,
          "Generation": 1
        },
        {
          
          "Name": "geodude",
          "Pokedex ID": 74,
          "Pokemon Order": 74,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 1
        },
        {
          
          "Name": "graveler",
          "Pokedex ID": 75,
          "Pokemon Order": 75,
          "Tier": "B",
          "Base Stats Total": 390,
          "Generation": 1
        },
        {
          
          "Name": "golem",
          "Pokedex ID": 76,
          "Pokemon Order": 76,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 1
        },
        {
          
          "Name": "ponyta",
          "Pokedex ID": 77,
          "Pokemon Order": 77,
          "Tier": "C",
          "Base Stats Total": 410,
          "Generation": 1
        },
        {
          
          "Name": "rapidash",
          "Pokedex ID": 78,
          "Pokemon Order": 78,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 1
        },
        {
          
          "Name": "slowpoke",
          "Pokedex ID": 79,
          "Pokemon Order": 79,
          "Tier": "C",
          "Base Stats Total": 315,
          "Generation": 1
        },
        {
          
          "Name": "slowbro",
          "Pokedex ID": 80,
          "Pokemon Order": 80,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "magnemite",
          "Pokedex ID": 81,
          "Pokemon Order": 81,
          "Tier": "C",
          "Base Stats Total": 325,
          "Generation": 1
        },
        {
          
          "Name": "magneton",
          "Pokedex ID": 82,
          "Pokemon Order": 82,
          "Tier": "B",
          "Base Stats Total": 465,
          "Generation": 1
        },
        {
          
          "Name": "farfetchd",
          "Pokedex ID": 83,
          "Pokemon Order": 83,
          "Tier": "C",
          "Base Stats Total": 377,
          "Generation": 1
        },
        {
          
          "Name": "doduo",
          "Pokedex ID": 84,
          "Pokemon Order": 84,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 1
        },
        {
          
          "Name": "dodrio",
          "Pokedex ID": 85,
          "Pokemon Order": 85,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 1
        },
        {
          
          "Name": "seel",
          "Pokedex ID": 86,
          "Pokemon Order": 86,
          "Tier": "C",
          "Base Stats Total": 325,
          "Generation": 1
        },
        {
          
          "Name": "dewgong",
          "Pokedex ID": 87,
          "Pokemon Order": 87,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 1
        },
        {
          
          "Name": "grimer",
          "Pokedex ID": 88,
          "Pokemon Order": 88,
          "Tier": "C",
          "Base Stats Total": 325,
          "Generation": 1
        },
        {
          
          "Name": "muk",
          "Pokedex ID": 89,
          "Pokemon Order": 89,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 1
        },
        {
          
          "Name": "shellder",
          "Pokedex ID": 90,
          "Pokemon Order": 90,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 1
        },
        {
          
          "Name": "cloyster",
          "Pokedex ID": 91,
          "Pokemon Order": 91,
          "Tier": "B",
          "Base Stats Total": 525,
          "Generation": 1
        },
        {
          
          "Name": "gastly",
          "Pokedex ID": 92,
          "Pokemon Order": 92,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 1
        },
        {
          
          "Name": "haunter",
          "Pokedex ID": 93,
          "Pokemon Order": 93,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 1
        },
        {
          
          "Name": "gengar",
          "Pokedex ID": 94,
          "Pokemon Order": 94,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 1
        },
        {
          
          "Name": "onix",
          "Pokedex ID": 95,
          "Pokemon Order": 95,
          "Tier": "C",
          "Base Stats Total": 385,
          "Generation": 1
        },
        {
          
          "Name": "drowzee",
          "Pokedex ID": 96,
          "Pokemon Order": 96,
          "Tier": "C",
          "Base Stats Total": 328,
          "Generation": 1
        },
        {
          
          "Name": "hypno",
          "Pokedex ID": 97,
          "Pokemon Order": 97,
          "Tier": "B",
          "Base Stats Total": 483,
          "Generation": 1
        },
        {
          
          "Name": "krabby",
          "Pokedex ID": 98,
          "Pokemon Order": 98,
          "Tier": "C",
          "Base Stats Total": 325,
          "Generation": 1
        },
        {
          
          "Name": "kingler",
          "Pokedex ID": 99,
          "Pokemon Order": 99,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 1
        },
        {
          
          "Name": "voltorb",
          "Pokedex ID": 100,
          "Pokemon Order": 100,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 1
        },
        {
          
          "Name": "electrode",
          "Pokedex ID": 101,
          "Pokemon Order": 101,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "exeggcute",
          "Pokedex ID": 102,
          "Pokemon Order": 102,
          "Tier": "C",
          "Base Stats Total": 325,
          "Generation": 1
        },
        {
          
          "Name": "exeggutor",
          "Pokedex ID": 103,
          "Pokemon Order": 103,
          "Tier": "B",
          "Base Stats Total": 530,
          "Generation": 1
        },
        {
          
          "Name": "cubone",
          "Pokedex ID": 104,
          "Pokemon Order": 104,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 1
        },
        {
          
          "Name": "marowak",
          "Pokedex ID": 105,
          "Pokemon Order": 105,
          "Tier": "B",
          "Base Stats Total": 425,
          "Generation": 1
        },
        {
          
          "Name": "hitmonlee",
          "Pokedex ID": 106,
          "Pokemon Order": 106,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 1
        },
        {
          
          "Name": "hitmonchan",
          "Pokedex ID": 107,
          "Pokemon Order": 107,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 1
        },
        {
          
          "Name": "lickitung",
          "Pokedex ID": 108,
          "Pokemon Order": 108,
          "Tier": "C",
          "Base Stats Total": 385,
          "Generation": 1
        },
        {
          
          "Name": "koffing",
          "Pokedex ID": 109,
          "Pokemon Order": 109,
          "Tier": "C",
          "Base Stats Total": 340,
          "Generation": 1
        },
        {
          
          "Name": "weezing",
          "Pokedex ID": 110,
          "Pokemon Order": 110,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "rhyhorn",
          "Pokedex ID": 111,
          "Pokemon Order": 111,
          "Tier": "C",
          "Base Stats Total": 345,
          "Generation": 1
        },
        {
          
          "Name": "rhydon",
          "Pokedex ID": 112,
          "Pokemon Order": 112,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 1
        },
        {
          
          "Name": "chansey",
          "Pokedex ID": 113,
          "Pokemon Order": 113,
          "Tier": "C",
          "Base Stats Total": 450,
          "Generation": 1
        },
        {
          
          "Name": "tangela",
          "Pokedex ID": 114,
          "Pokemon Order": 114,
          "Tier": "C",
          "Base Stats Total": 435,
          "Generation": 1
        },
        {
          
          "Name": "kangaskhan",
          "Pokedex ID": 115,
          "Pokemon Order": 115,
          "Tier": "C",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "horsea",
          "Pokedex ID": 116,
          "Pokemon Order": 116,
          "Tier": "C",
          "Base Stats Total": 295,
          "Generation": 1
        },
        {
          
          "Name": "seadra",
          "Pokedex ID": 117,
          "Pokemon Order": 117,
          "Tier": "B",
          "Base Stats Total": 440,
          "Generation": 1
        },
        {
          
          "Name": "goldeen",
          "Pokedex ID": 118,
          "Pokemon Order": 118,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 1
        },
        {
          
          "Name": "seaking",
          "Pokedex ID": 119,
          "Pokemon Order": 119,
          "Tier": "B",
          "Base Stats Total": 450,
          "Generation": 1
        },
        {
          
          "Name": "staryu",
          "Pokedex ID": 120,
          "Pokemon Order": 120,
          "Tier": "C",
          "Base Stats Total": 340,
          "Generation": 1
        },
        {
          
          "Name": "starmie",
          "Pokedex ID": 121,
          "Pokemon Order": 121,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 1
        },
        {
          
          "Name": "mr-mime",
          "Pokedex ID": 122,
          "Pokemon Order": 122,
          "Tier": "C",
          "Base Stats Total": 460,
          "Generation": 1
        },
        {
          
          "Name": "scyther",
          "Pokedex ID": 123,
          "Pokemon Order": 123,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 1
        },
        {
          
          "Name": "jynx",
          "Pokedex ID": 124,
          "Pokemon Order": 124,
          "Tier": "C",
          "Base Stats Total": 455,
          "Generation": 1
        },
        {
          
          "Name": "electabuzz",
          "Pokedex ID": 125,
          "Pokemon Order": 125,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "magmar",
          "Pokedex ID": 126,
          "Pokemon Order": 126,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 1
        },
        {
          
          "Name": "pinsir",
          "Pokedex ID": 127,
          "Pokemon Order": 127,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 1
        },
        {
          
          "Name": "tauros",
          "Pokedex ID": 128,
          "Pokemon Order": 128,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 1
        },
        {
          
          "Name": "magikarp",
          "Pokedex ID": 129,
          "Pokemon Order": 129,
          "Tier": "C",
          "Base Stats Total": 200,
          "Generation": 1
        },
        {
          
          "Name": "gyarados",
          "Pokedex ID": 130,
          "Pokemon Order": 130,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 1
        },
        {
          
          "Name": "lapras",
          "Pokedex ID": 131,
          "Pokemon Order": 131,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 1
        },
        {
          
          "Name": "ditto",
          "Pokedex ID": 132,
          "Pokemon Order": 132,
          "Tier": "C",
          "Base Stats Total": 288,
          "Generation": 1
        },
        {
          
          "Name": "eevee",
          "Pokedex ID": 133,
          "Pokemon Order": 133,
          "Tier": "B",
          "Base Stats Total": 325,
          "Generation": 1
        },
        {
          
          "Name": "vaporeon",
          "Pokedex ID": 134,
          "Pokemon Order": 134,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 1
        },
        {
          
          "Name": "jolteon",
          "Pokedex ID": 135,
          "Pokemon Order": 135,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 1
        },
        {
          
          "Name": "flareon",
          "Pokedex ID": 136,
          "Pokemon Order": 136,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 1
        },
        {
          
          "Name": "porygon",
          "Pokedex ID": 137,
          "Pokemon Order": 137,
          "Tier": "B",
          "Base Stats Total": 395,
          "Generation": 1
        },
        {
          
          "Name": "omanyte",
          "Pokedex ID": 138,
          "Pokemon Order": 138,
          "Tier": "C",
          "Base Stats Total": 355,
          "Generation": 1
        },
        {
          
          "Name": "omastar",
          "Pokedex ID": 139,
          "Pokemon Order": 139,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 1
        },
        {
          
          "Name": "kabuto",
          "Pokedex ID": 140,
          "Pokemon Order": 140,
          "Tier": "C",
          "Base Stats Total": 355,
          "Generation": 1
        },
        {
          
          "Name": "kabutops",
          "Pokedex ID": 141,
          "Pokemon Order": 141,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 1
        },
        {
          
          "Name": "aerodactyl",
          "Pokedex ID": 142,
          "Pokemon Order": 142,
          "Tier": "A",
          "Base Stats Total": 515,
          "Generation": 1
        },
        {
          
          "Name": "snorlax",
          "Pokedex ID": 143,
          "Pokemon Order": 143,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 1
        },
        {
          
          "Name": "articuno",
          "Pokedex ID": 144,
          "Pokemon Order": 144,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 1
        },
        {
          
          "Name": "zapdos",
          "Pokedex ID": 145,
          "Pokemon Order": 145,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 1
        },
        {
          
          "Name": "moltres",
          "Pokedex ID": 146,
          "Pokemon Order": 146,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 1
        },
        {
          
          "Name": "dratini",
          "Pokedex ID": 147,
          "Pokemon Order": 147,
          "Tier": "B",
          "Base Stats Total": 300,
          "Generation": 1
        },
        {
          
          "Name": "dragonair",
          "Pokedex ID": 148,
          "Pokemon Order": 148,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 1
        },
        {
          
          "Name": "dragonite",
          "Pokedex ID": 149,
          "Pokemon Order": 149,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 1
        },
        {
          
          "Name": "mewtwo",
          "Pokedex ID": 150,
          "Pokemon Order": 150,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 1
        },
        {
          
          "Name": "mew",
          "Pokedex ID": 151,
          "Pokemon Order": 151,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 1
        },
        {
          
          "Name": "chikorita",
          "Pokedex ID": 152,
          "Pokemon Order": 152,
          "Tier": "Starter",
          "Base Stats Total": 318,
          "Generation": 2
        },
        {
          
          "Name": "bayleef",
          "Pokedex ID": 153,
          "Pokemon Order": 153,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 2
        },
        {
          
          "Name": "meganium",
          "Pokedex ID": 154,
          "Pokemon Order": 154,
          "Tier": "Starter",
          "Base Stats Total": 525,
          "Generation": 2
        },
        {
          
          "Name": "cyndaquil",
          "Pokedex ID": 155,
          "Pokemon Order": 155,
          "Tier": "Starter",
          "Base Stats Total": 309,
          "Generation": 2
        },
        {
          
          "Name": "quilava",
          "Pokedex ID": 156,
          "Pokemon Order": 156,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 2
        },
        {
          
          "Name": "typhlosion",
          "Pokedex ID": 157,
          "Pokemon Order": 157,
          "Tier": "Starter",
          "Base Stats Total": 534,
          "Generation": 2
        },
        {
          
          "Name": "totodile",
          "Pokedex ID": 158,
          "Pokemon Order": 158,
          "Tier": "Starter",
          "Base Stats Total": 314,
          "Generation": 2
        },
        {
          
          "Name": "croconaw",
          "Pokedex ID": 159,
          "Pokemon Order": 159,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 2
        },
        {
          
          "Name": "feraligatr",
          "Pokedex ID": 160,
          "Pokemon Order": 160,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 2
        },
        {
          
          "Name": "sentret",
          "Pokedex ID": 161,
          "Pokemon Order": 161,
          "Tier": "C",
          "Base Stats Total": 215,
          "Generation": 2
        },
        {
          
          "Name": "furret",
          "Pokedex ID": 162,
          "Pokemon Order": 162,
          "Tier": "B",
          "Base Stats Total": 415,
          "Generation": 2
        },
        {
          
          "Name": "hoothoot",
          "Pokedex ID": 163,
          "Pokemon Order": 163,
          "Tier": "C",
          "Base Stats Total": 262,
          "Generation": 2
        },
        {
          
          "Name": "noctowl",
          "Pokedex ID": 164,
          "Pokemon Order": 164,
          "Tier": "B",
          "Base Stats Total": 452,
          "Generation": 2
        },
        {
          
          "Name": "ledyba",
          "Pokedex ID": 165,
          "Pokemon Order": 165,
          "Tier": "C",
          "Base Stats Total": 265,
          "Generation": 2
        },
        {
          
          "Name": "ledian",
          "Pokedex ID": 166,
          "Pokemon Order": 166,
          "Tier": "B",
          "Base Stats Total": 390,
          "Generation": 2
        },
        {
          
          "Name": "spinarak",
          "Pokedex ID": 167,
          "Pokemon Order": 167,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 2
        },
        {
          
          "Name": "ariados",
          "Pokedex ID": 168,
          "Pokemon Order": 168,
          "Tier": "B",
          "Base Stats Total": 400,
          "Generation": 2
        },
        {
          
          "Name": "crobat",
          "Pokedex ID": 169,
          "Pokemon Order": 169,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 2
        },
        {
          
          "Name": "chinchou",
          "Pokedex ID": 170,
          "Pokemon Order": 170,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 2
        },
        {
          
          "Name": "lanturn",
          "Pokedex ID": 171,
          "Pokemon Order": 171,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 2
        },
        {
          
          "Name": "pichu",
          "Pokedex ID": 172,
          "Pokemon Order": 172,
          "Tier": "B",
          "Base Stats Total": 205,
          "Generation": 2
        },
        {
          
          "Name": "cleffa",
          "Pokedex ID": 173,
          "Pokemon Order": 173,
          "Tier": "C",
          "Base Stats Total": 218,
          "Generation": 2
        },
        {
          
          "Name": "igglybuff",
          "Pokedex ID": 174,
          "Pokemon Order": 174,
          "Tier": "C",
          "Base Stats Total": 210,
          "Generation": 2
        },
        {
          
          "Name": "togepi",
          "Pokedex ID": 175,
          "Pokemon Order": 175,
          "Tier": "C",
          "Base Stats Total": 245,
          "Generation": 2
        },
        {
          
          "Name": "togetic",
          "Pokedex ID": 176,
          "Pokemon Order": 176,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 2
        },
        {
          
          "Name": "natu",
          "Pokedex ID": 177,
          "Pokemon Order": 177,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 2
        },
        {
          
          "Name": "xatu",
          "Pokedex ID": 178,
          "Pokemon Order": 178,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 2
        },
        {
          
          "Name": "mareep",
          "Pokedex ID": 179,
          "Pokemon Order": 179,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 2
        },
        {
          
          "Name": "flaaffy",
          "Pokedex ID": 180,
          "Pokemon Order": 180,
          "Tier": "B",
          "Base Stats Total": 365,
          "Generation": 2
        },
        {
          
          "Name": "ampharos",
          "Pokedex ID": 181,
          "Pokemon Order": 181,
          "Tier": "B",
          "Base Stats Total": 510,
          "Generation": 2
        },
        {
          
          "Name": "bellossom",
          "Pokedex ID": 182,
          "Pokemon Order": 182,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 2
        },
        {
          
          "Name": "marill",
          "Pokedex ID": 183,
          "Pokemon Order": 183,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 2
        },
        {
          
          "Name": "azumarill",
          "Pokedex ID": 184,
          "Pokemon Order": 184,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 2
        },
        {
          
          "Name": "sudowoodo",
          "Pokedex ID": 185,
          "Pokemon Order": 185,
          "Tier": "C",
          "Base Stats Total": 410,
          "Generation": 2
        },
        {
          
          "Name": "politoed",
          "Pokedex ID": 186,
          "Pokemon Order": 186,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "hoppip",
          "Pokedex ID": 187,
          "Pokemon Order": 187,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 2
        },
        {
          
          "Name": "skiploom",
          "Pokedex ID": 188,
          "Pokemon Order": 188,
          "Tier": "B",
          "Base Stats Total": 340,
          "Generation": 2
        },
        {
          
          "Name": "jumpluff",
          "Pokedex ID": 189,
          "Pokemon Order": 189,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 2
        },
        {
          
          "Name": "aipom",
          "Pokedex ID": 190,
          "Pokemon Order": 190,
          "Tier": "C",
          "Base Stats Total": 360,
          "Generation": 2
        },
        {
          
          "Name": "sunkern",
          "Pokedex ID": 191,
          "Pokemon Order": 191,
          "Tier": "C",
          "Base Stats Total": 180,
          "Generation": 2
        },
        {
          
          "Name": "sunflora",
          "Pokedex ID": 192,
          "Pokemon Order": 192,
          "Tier": "B",
          "Base Stats Total": 425,
          "Generation": 2
        },
        {
          
          "Name": "yanma",
          "Pokedex ID": 193,
          "Pokemon Order": 193,
          "Tier": "C",
          "Base Stats Total": 390,
          "Generation": 2
        },
        {
          
          "Name": "wooper",
          "Pokedex ID": 194,
          "Pokemon Order": 194,
          "Tier": "C",
          "Base Stats Total": 210,
          "Generation": 2
        },
        {
          
          "Name": "quagsire",
          "Pokedex ID": 195,
          "Pokemon Order": 195,
          "Tier": "B",
          "Base Stats Total": 430,
          "Generation": 2
        },
        {
          
          "Name": "espeon",
          "Pokedex ID": 196,
          "Pokemon Order": 196,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 2
        },
        {
          
          "Name": "umbreon",
          "Pokedex ID": 197,
          "Pokemon Order": 197,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 2
        },
        {
          
          "Name": "murkrow",
          "Pokedex ID": 198,
          "Pokemon Order": 198,
          "Tier": "C",
          "Base Stats Total": 405,
          "Generation": 2
        },
        {
          
          "Name": "slowking",
          "Pokedex ID": 199,
          "Pokemon Order": 199,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 2
        },
        {
          
          "Name": "misdreavus",
          "Pokedex ID": 200,
          "Pokemon Order": 200,
          "Tier": "C",
          "Base Stats Total": 435,
          "Generation": 2
        },
        {
          
          "Name": "unown-a",
          "Pokedex ID": 201,
          "Pokemon Order": 201,
          "Tier": "C",
          "Base Stats Total": 336,
          "Generation": 2
        },
        {
          
          "Name": "wobbuffet",
          "Pokedex ID": 202,
          "Pokemon Order": 202,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 2
        },
        {
          
          "Name": "girafarig",
          "Pokedex ID": 203,
          "Pokemon Order": 203,
          "Tier": "C",
          "Base Stats Total": 455,
          "Generation": 2
        },
        {
          
          "Name": "pineco",
          "Pokedex ID": 204,
          "Pokemon Order": 204,
          "Tier": "C",
          "Base Stats Total": 290,
          "Generation": 2
        },
        {
          
          "Name": "forretress",
          "Pokedex ID": 205,
          "Pokemon Order": 205,
          "Tier": "B",
          "Base Stats Total": 465,
          "Generation": 2
        },
        {
          
          "Name": "dunsparce",
          "Pokedex ID": 206,
          "Pokemon Order": 206,
          "Tier": "C",
          "Base Stats Total": 415,
          "Generation": 2
        },
        {
          
          "Name": "gligar",
          "Pokedex ID": 207,
          "Pokemon Order": 207,
          "Tier": "C",
          "Base Stats Total": 430,
          "Generation": 2
        },
        {
          
          "Name": "steelix",
          "Pokedex ID": 208,
          "Pokemon Order": 208,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 2
        },
        {
          
          "Name": "snubbull",
          "Pokedex ID": 209,
          "Pokemon Order": 209,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 2
        },
        {
          
          "Name": "granbull",
          "Pokedex ID": 210,
          "Pokemon Order": 210,
          "Tier": "B",
          "Base Stats Total": 450,
          "Generation": 2
        },
        {
          
          "Name": "qwilfish",
          "Pokedex ID": 211,
          "Pokemon Order": 211,
          "Tier": "C",
          "Base Stats Total": 440,
          "Generation": 2
        },
        {
          
          "Name": "scizor",
          "Pokedex ID": 212,
          "Pokemon Order": 212,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "shuckle",
          "Pokedex ID": 213,
          "Pokemon Order": 213,
          "Tier": "C",
          "Base Stats Total": 505,
          "Generation": 2
        },
        {
          
          "Name": "heracross",
          "Pokedex ID": 214,
          "Pokemon Order": 214,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "sneasel",
          "Pokedex ID": 215,
          "Pokemon Order": 215,
          "Tier": "C",
          "Base Stats Total": 430,
          "Generation": 2
        },
        {
          
          "Name": "teddiursa",
          "Pokedex ID": 216,
          "Pokemon Order": 216,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 2
        },
        {
          
          "Name": "ursaring",
          "Pokedex ID": 217,
          "Pokemon Order": 217,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "slugma",
          "Pokedex ID": 218,
          "Pokemon Order": 218,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 2
        },
        {
          
          "Name": "magcargo",
          "Pokedex ID": 219,
          "Pokemon Order": 219,
          "Tier": "B",
          "Base Stats Total": 430,
          "Generation": 2
        },
        {
          
          "Name": "swinub",
          "Pokedex ID": 220,
          "Pokemon Order": 220,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 2
        },
        {
          
          "Name": "piloswine",
          "Pokedex ID": 221,
          "Pokemon Order": 221,
          "Tier": "B",
          "Base Stats Total": 450,
          "Generation": 2
        },
        {
          
          "Name": "corsola",
          "Pokedex ID": 222,
          "Pokemon Order": 222,
          "Tier": "C",
          "Base Stats Total": 410,
          "Generation": 2
        },
        {
          
          "Name": "remoraid",
          "Pokedex ID": 223,
          "Pokemon Order": 223,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 2
        },
        {
          
          "Name": "octillery",
          "Pokedex ID": 224,
          "Pokemon Order": 224,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 2
        },
        {
          
          "Name": "delibird",
          "Pokedex ID": 225,
          "Pokemon Order": 225,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 2
        },
        {
          
          "Name": "mantine",
          "Pokedex ID": 226,
          "Pokemon Order": 226,
          "Tier": "C",
          "Base Stats Total": 485,
          "Generation": 2
        },
        {
          
          "Name": "skarmory",
          "Pokedex ID": 227,
          "Pokemon Order": 227,
          "Tier": "B",
          "Base Stats Total": 465,
          "Generation": 2
        },
        {
          
          "Name": "houndour",
          "Pokedex ID": 228,
          "Pokemon Order": 228,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 2
        },
        {
          
          "Name": "houndoom",
          "Pokedex ID": 229,
          "Pokemon Order": 229,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "kingdra",
          "Pokedex ID": 230,
          "Pokemon Order": 230,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 2
        },
        {
          
          "Name": "phanpy",
          "Pokedex ID": 231,
          "Pokemon Order": 231,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 2
        },
        {
          
          "Name": "donphan",
          "Pokedex ID": 232,
          "Pokemon Order": 232,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "porygon2",
          "Pokedex ID": 233,
          "Pokemon Order": 233,
          "Tier": "B",
          "Base Stats Total": 515,
          "Generation": 2
        },
        {
          
          "Name": "stantler",
          "Pokedex ID": 234,
          "Pokemon Order": 234,
          "Tier": "C",
          "Base Stats Total": 465,
          "Generation": 2
        },
        {
          
          "Name": "smeargle",
          "Pokedex ID": 235,
          "Pokemon Order": 235,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 2
        },
        {
          
          "Name": "tyrogue",
          "Pokedex ID": 236,
          "Pokemon Order": 236,
          "Tier": "C",
          "Base Stats Total": 210,
          "Generation": 2
        },
        {
          
          "Name": "hitmontop",
          "Pokedex ID": 237,
          "Pokemon Order": 237,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 2
        },
        {
          
          "Name": "smoochum",
          "Pokedex ID": 238,
          "Pokemon Order": 238,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 2
        },
        {
          
          "Name": "elekid",
          "Pokedex ID": 239,
          "Pokemon Order": 239,
          "Tier": "C",
          "Base Stats Total": 360,
          "Generation": 2
        },
        {
          
          "Name": "magby",
          "Pokedex ID": 240,
          "Pokemon Order": 240,
          "Tier": "C",
          "Base Stats Total": 365,
          "Generation": 2
        },
        {
          
          "Name": "miltank",
          "Pokedex ID": 241,
          "Pokemon Order": 241,
          "Tier": "C",
          "Base Stats Total": 490,
          "Generation": 2
        },
        {
          
          "Name": "blissey",
          "Pokedex ID": 242,
          "Pokemon Order": 242,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 2
        },
        {
          
          "Name": "raikou",
          "Pokedex ID": 243,
          "Pokemon Order": 243,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 2
        },
        {
          
          "Name": "entei",
          "Pokedex ID": 244,
          "Pokemon Order": 244,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 2
        },
        {
          
          "Name": "suicune",
          "Pokedex ID": 245,
          "Pokemon Order": 245,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 2
        },
        {
          
          "Name": "larvitar",
          "Pokedex ID": 246,
          "Pokemon Order": 246,
          "Tier": "B",
          "Base Stats Total": 300,
          "Generation": 2
        },
        {
          
          "Name": "pupitar",
          "Pokedex ID": 247,
          "Pokemon Order": 247,
          "Tier": "A",
          "Base Stats Total": 410,
          "Generation": 2
        },
        {
          
          "Name": "tyranitar",
          "Pokedex ID": 248,
          "Pokemon Order": 248,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 2
        },
        {
          
          "Name": "lugia",
          "Pokedex ID": 249,
          "Pokemon Order": 249,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 2
        },
        {
          
          "Name": "ho-oh",
          "Pokedex ID": 250,
          "Pokemon Order": 250,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 2
        },
        {
          
          "Name": "celebi",
          "Pokedex ID": 251,
          "Pokemon Order": 251,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 2
        },
        {
          
          "Name": "treecko",
          "Pokedex ID": 252,
          "Pokemon Order": 252,
          "Tier": "Starter",
          "Base Stats Total": 310,
          "Generation": 3
        },
        {
          
          "Name": "grovyle",
          "Pokedex ID": 253,
          "Pokemon Order": 253,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 3
        },
        {
          
          "Name": "sceptile",
          "Pokedex ID": 254,
          "Pokemon Order": 254,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 3
        },
        {
          
          "Name": "torchic",
          "Pokedex ID": 255,
          "Pokemon Order": 255,
          "Tier": "Starter",
          "Base Stats Total": 310,
          "Generation": 3
        },
        {
          
          "Name": "combusken",
          "Pokedex ID": 256,
          "Pokemon Order": 256,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 3
        },
        {
          
          "Name": "blaziken",
          "Pokedex ID": 257,
          "Pokemon Order": 257,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 3
        },
        {
          
          "Name": "mudkip",
          "Pokedex ID": 258,
          "Pokemon Order": 258,
          "Tier": "Starter",
          "Base Stats Total": 310,
          "Generation": 3
        },
        {
          
          "Name": "marshtomp",
          "Pokedex ID": 259,
          "Pokemon Order": 259,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 3
        },
        {
          
          "Name": "swampert",
          "Pokedex ID": 260,
          "Pokemon Order": 260,
          "Tier": "Starter",
          "Base Stats Total": 535,
          "Generation": 3
        },
        {
          
          "Name": "poochyena",
          "Pokedex ID": 261,
          "Pokemon Order": 261,
          "Tier": "C",
          "Base Stats Total": 220,
          "Generation": 3
        },
        {
          
          "Name": "mightyena",
          "Pokedex ID": 262,
          "Pokemon Order": 262,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "zigzagoon",
          "Pokedex ID": 263,
          "Pokemon Order": 263,
          "Tier": "C",
          "Base Stats Total": 240,
          "Generation": 3
        },
        {
          
          "Name": "linoone",
          "Pokedex ID": 264,
          "Pokemon Order": 264,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "wurmple",
          "Pokedex ID": 265,
          "Pokemon Order": 265,
          "Tier": "C",
          "Base Stats Total": 195,
          "Generation": 3
        },
        {
          
          "Name": "silcoon",
          "Pokedex ID": 266,
          "Pokemon Order": 266,
          "Tier": "C",
          "Base Stats Total": 205,
          "Generation": 3
        },
        {
          
          "Name": "beautifly",
          "Pokedex ID": 267,
          "Pokemon Order": 267,
          "Tier": "B",
          "Base Stats Total": 395,
          "Generation": 3
        },
        {
          
          "Name": "cascoon",
          "Pokedex ID": 268,
          "Pokemon Order": 268,
          "Tier": "C",
          "Base Stats Total": 205,
          "Generation": 3
        },
        {
          
          "Name": "dustox",
          "Pokedex ID": 269,
          "Pokemon Order": 269,
          "Tier": "B",
          "Base Stats Total": 385,
          "Generation": 3
        },
        {
          
          "Name": "lotad",
          "Pokedex ID": 270,
          "Pokemon Order": 270,
          "Tier": "C",
          "Base Stats Total": 220,
          "Generation": 3
        },
        {
          
          "Name": "lombre",
          "Pokedex ID": 271,
          "Pokemon Order": 271,
          "Tier": "B",
          "Base Stats Total": 340,
          "Generation": 3
        },
        {
          
          "Name": "ludicolo",
          "Pokedex ID": 272,
          "Pokemon Order": 272,
          "Tier": "A",
          "Base Stats Total": 480,
          "Generation": 3
        },
        {
          
          "Name": "seedot",
          "Pokedex ID": 273,
          "Pokemon Order": 273,
          "Tier": "C",
          "Base Stats Total": 220,
          "Generation": 3
        },
        {
          
          "Name": "nuzleaf",
          "Pokedex ID": 274,
          "Pokemon Order": 274,
          "Tier": "B",
          "Base Stats Total": 340,
          "Generation": 3
        },
        {
          
          "Name": "shiftry",
          "Pokedex ID": 275,
          "Pokemon Order": 275,
          "Tier": "A",
          "Base Stats Total": 480,
          "Generation": 3
        },
        {
          
          "Name": "taillow",
          "Pokedex ID": 276,
          "Pokemon Order": 276,
          "Tier": "C",
          "Base Stats Total": 270,
          "Generation": 3
        },
        {
          
          "Name": "swellow",
          "Pokedex ID": 277,
          "Pokemon Order": 277,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 3
        },
        {
          
          "Name": "wingull",
          "Pokedex ID": 278,
          "Pokemon Order": 278,
          "Tier": "C",
          "Base Stats Total": 270,
          "Generation": 3
        },
        {
          
          "Name": "pelipper",
          "Pokedex ID": 279,
          "Pokemon Order": 279,
          "Tier": "B",
          "Base Stats Total": 440,
          "Generation": 3
        },
        {
          
          "Name": "ralts",
          "Pokedex ID": 280,
          "Pokemon Order": 280,
          "Tier": "C",
          "Base Stats Total": 198,
          "Generation": 3
        },
        {
          
          "Name": "kirlia",
          "Pokedex ID": 281,
          "Pokemon Order": 281,
          "Tier": "B",
          "Base Stats Total": 278,
          "Generation": 3
        },
        {
          
          "Name": "gardevoir",
          "Pokedex ID": 282,
          "Pokemon Order": 282,
          "Tier": "A",
          "Base Stats Total": 518,
          "Generation": 3
        },
        {
          
          "Name": "surskit",
          "Pokedex ID": 283,
          "Pokemon Order": 283,
          "Tier": "C",
          "Base Stats Total": 269,
          "Generation": 3
        },
        {
          
          "Name": "masquerain",
          "Pokedex ID": 284,
          "Pokemon Order": 284,
          "Tier": "B",
          "Base Stats Total": 454,
          "Generation": 3
        },
        {
          
          "Name": "shroomish",
          "Pokedex ID": 285,
          "Pokemon Order": 285,
          "Tier": "C",
          "Base Stats Total": 295,
          "Generation": 3
        },
        {
          
          "Name": "breloom",
          "Pokedex ID": 286,
          "Pokemon Order": 286,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 3
        },
        {
          
          "Name": "slakoth",
          "Pokedex ID": 287,
          "Pokemon Order": 287,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 3
        },
        {
          
          "Name": "vigoroth",
          "Pokedex ID": 288,
          "Pokemon Order": 288,
          "Tier": "B",
          "Base Stats Total": 440,
          "Generation": 3
        },
        {
          
          "Name": "slaking",
          "Pokedex ID": 289,
          "Pokemon Order": 289,
          "Tier": "A",
          "Base Stats Total": 670,
          "Generation": 3
        },
        {
          
          "Name": "nincada",
          "Pokedex ID": 290,
          "Pokemon Order": 290,
          "Tier": "C",
          "Base Stats Total": 266,
          "Generation": 3
        },
        {
          
          "Name": "ninjask",
          "Pokedex ID": 291,
          "Pokemon Order": 291,
          "Tier": "C",
          "Base Stats Total": 456,
          "Generation": 3
        },
        {
          
          "Name": "shedinja",
          "Pokedex ID": 292,
          "Pokemon Order": 292,
          "Tier": "B",
          "Base Stats Total": 236,
          "Generation": 3
        },
        {
          
          "Name": "whismur",
          "Pokedex ID": 293,
          "Pokemon Order": 293,
          "Tier": "C",
          "Base Stats Total": 240,
          "Generation": 3
        },
        {
          
          "Name": "loudred",
          "Pokedex ID": 294,
          "Pokemon Order": 294,
          "Tier": "B",
          "Base Stats Total": 360,
          "Generation": 3
        },
        {
          
          "Name": "exploud",
          "Pokedex ID": 295,
          "Pokemon Order": 295,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 3
        },
        {
          
          "Name": "makuhita",
          "Pokedex ID": 296,
          "Pokemon Order": 296,
          "Tier": "C",
          "Base Stats Total": 237,
          "Generation": 3
        },
        {
          
          "Name": "hariyama",
          "Pokedex ID": 297,
          "Pokemon Order": 297,
          "Tier": "B",
          "Base Stats Total": 474,
          "Generation": 3
        },
        {
          
          "Name": "azurill",
          "Pokedex ID": 298,
          "Pokemon Order": 298,
          "Tier": "C",
          "Base Stats Total": 190,
          "Generation": 3
        },
        {
          
          "Name": "nosepass",
          "Pokedex ID": 299,
          "Pokemon Order": 299,
          "Tier": "C",
          "Base Stats Total": 375,
          "Generation": 3
        },
        {
          
          "Name": "skitty",
          "Pokedex ID": 300,
          "Pokemon Order": 300,
          "Tier": "C",
          "Base Stats Total": 260,
          "Generation": 3
        },
        {
          
          "Name": "delcatty",
          "Pokedex ID": 301,
          "Pokemon Order": 301,
          "Tier": "B",
          "Base Stats Total": 400,
          "Generation": 3
        },
        {
          
          "Name": "sableye",
          "Pokedex ID": 302,
          "Pokemon Order": 302,
          "Tier": "C",
          "Base Stats Total": 380,
          "Generation": 3
        },
        {
          
          "Name": "mawile",
          "Pokedex ID": 303,
          "Pokemon Order": 303,
          "Tier": "C",
          "Base Stats Total": 380,
          "Generation": 3
        },
        {
          
          "Name": "aron",
          "Pokedex ID": 304,
          "Pokemon Order": 304,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 3
        },
        {
          
          "Name": "lairon",
          "Pokedex ID": 305,
          "Pokemon Order": 305,
          "Tier": "B",
          "Base Stats Total": 430,
          "Generation": 3
        },
        {
          
          "Name": "aggron",
          "Pokedex ID": 306,
          "Pokemon Order": 306,
          "Tier": "A",
          "Base Stats Total": 530,
          "Generation": 3
        },
        {
          
          "Name": "meditite",
          "Pokedex ID": 307,
          "Pokemon Order": 307,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 3
        },
        {
          
          "Name": "medicham",
          "Pokedex ID": 308,
          "Pokemon Order": 308,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 3
        },
        {
          
          "Name": "electrike",
          "Pokedex ID": 309,
          "Pokemon Order": 309,
          "Tier": "C",
          "Base Stats Total": 295,
          "Generation": 3
        },
        {
          
          "Name": "manectric",
          "Pokedex ID": 310,
          "Pokemon Order": 310,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 3
        },
        {
          
          "Name": "plusle",
          "Pokedex ID": 311,
          "Pokemon Order": 311,
          "Tier": "C",
          "Base Stats Total": 405,
          "Generation": 3
        },
        {
          
          "Name": "minun",
          "Pokedex ID": 312,
          "Pokemon Order": 312,
          "Tier": "C",
          "Base Stats Total": 405,
          "Generation": 3
        },
        {
          
          "Name": "volbeat",
          "Pokedex ID": 313,
          "Pokemon Order": 313,
          "Tier": "C",
          "Base Stats Total": 430,
          "Generation": 3
        },
        {
          
          "Name": "illumise",
          "Pokedex ID": 314,
          "Pokemon Order": 314,
          "Tier": "C",
          "Base Stats Total": 430,
          "Generation": 3
        },
        {
          
          "Name": "roselia",
          "Pokedex ID": 315,
          "Pokemon Order": 315,
          "Tier": "C",
          "Base Stats Total": 400,
          "Generation": 3
        },
        {
          
          "Name": "gulpin",
          "Pokedex ID": 316,
          "Pokemon Order": 316,
          "Tier": "C",
          "Base Stats Total": 302,
          "Generation": 3
        },
        {
          
          "Name": "swalot",
          "Pokedex ID": 317,
          "Pokemon Order": 317,
          "Tier": "B",
          "Base Stats Total": 467,
          "Generation": 3
        },
        {
          
          "Name": "carvanha",
          "Pokedex ID": 318,
          "Pokemon Order": 318,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 3
        },
        {
          
          "Name": "sharpedo",
          "Pokedex ID": 319,
          "Pokemon Order": 319,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 3
        },
        {
          
          "Name": "wailmer",
          "Pokedex ID": 320,
          "Pokemon Order": 320,
          "Tier": "C",
          "Base Stats Total": 400,
          "Generation": 3
        },
        {
          
          "Name": "wailord",
          "Pokedex ID": 321,
          "Pokemon Order": 321,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 3
        },
        {
          
          "Name": "numel",
          "Pokedex ID": 322,
          "Pokemon Order": 322,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 3
        },
        {
          
          "Name": "camerupt",
          "Pokedex ID": 323,
          "Pokemon Order": 323,
          "Tier": "A",
          "Base Stats Total": 460,
          "Generation": 3
        },
        {
          
          "Name": "torkoal",
          "Pokedex ID": 324,
          "Pokemon Order": 324,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 3
        },
        {
          
          "Name": "spoink",
          "Pokedex ID": 325,
          "Pokemon Order": 325,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 3
        },
        {
          
          "Name": "grumpig",
          "Pokedex ID": 326,
          "Pokemon Order": 326,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 3
        },
        {
          
          "Name": "spinda",
          "Pokedex ID": 327,
          "Pokemon Order": 327,
          "Tier": "C",
          "Base Stats Total": 360,
          "Generation": 3
        },
        {
          
          "Name": "trapinch",
          "Pokedex ID": 328,
          "Pokemon Order": 328,
          "Tier": "B",
          "Base Stats Total": 290,
          "Generation": 3
        },
        {
          
          "Name": "vibrava",
          "Pokedex ID": 329,
          "Pokemon Order": 329,
          "Tier": "B",
          "Base Stats Total": 340,
          "Generation": 3
        },
        {
          
          "Name": "flygon",
          "Pokedex ID": 330,
          "Pokemon Order": 330,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 3
        },
        {
          
          "Name": "cacnea",
          "Pokedex ID": 331,
          "Pokemon Order": 331,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 3
        },
        {
          
          "Name": "cacturne",
          "Pokedex ID": 332,
          "Pokemon Order": 332,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 3
        },
        {
          
          "Name": "swablu",
          "Pokedex ID": 333,
          "Pokemon Order": 333,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 3
        },
        {
          
          "Name": "altaria",
          "Pokedex ID": 334,
          "Pokemon Order": 334,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 3
        },
        {
          
          "Name": "zangoose",
          "Pokedex ID": 335,
          "Pokemon Order": 335,
          "Tier": "B",
          "Base Stats Total": 458,
          "Generation": 3
        },
        {
          
          "Name": "seviper",
          "Pokedex ID": 336,
          "Pokemon Order": 336,
          "Tier": "B",
          "Base Stats Total": 458,
          "Generation": 3
        },
        {
          
          "Name": "lunatone",
          "Pokedex ID": 337,
          "Pokemon Order": 337,
          "Tier": "C",
          "Base Stats Total": 460,
          "Generation": 3
        },
        {
          
          "Name": "solrock",
          "Pokedex ID": 338,
          "Pokemon Order": 338,
          "Tier": "C",
          "Base Stats Total": 460,
          "Generation": 3
        },
        {
          
          "Name": "barboach",
          "Pokedex ID": 339,
          "Pokemon Order": 339,
          "Tier": "C",
          "Base Stats Total": 288,
          "Generation": 3
        },
        {
          
          "Name": "whiscash",
          "Pokedex ID": 340,
          "Pokemon Order": 340,
          "Tier": "B",
          "Base Stats Total": 468,
          "Generation": 3
        },
        {
          
          "Name": "corphish",
          "Pokedex ID": 341,
          "Pokemon Order": 341,
          "Tier": "C",
          "Base Stats Total": 308,
          "Generation": 3
        },
        {
          
          "Name": "crawdaunt",
          "Pokedex ID": 342,
          "Pokemon Order": 342,
          "Tier": "B",
          "Base Stats Total": 468,
          "Generation": 3
        },
        {
          
          "Name": "baltoy",
          "Pokedex ID": 343,
          "Pokemon Order": 343,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 3
        },
        {
          
          "Name": "claydol",
          "Pokedex ID": 344,
          "Pokemon Order": 344,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 3
        },
        {
          
          "Name": "lileep",
          "Pokedex ID": 345,
          "Pokemon Order": 345,
          "Tier": "C",
          "Base Stats Total": 355,
          "Generation": 3
        },
        {
          
          "Name": "cradily",
          "Pokedex ID": 346,
          "Pokemon Order": 346,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 3
        },
        {
          
          "Name": "anorith",
          "Pokedex ID": 347,
          "Pokemon Order": 347,
          "Tier": "C",
          "Base Stats Total": 355,
          "Generation": 3
        },
        {
          
          "Name": "armaldo",
          "Pokedex ID": 348,
          "Pokemon Order": 348,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 3
        },
        {
          
          "Name": "feebas",
          "Pokedex ID": 349,
          "Pokemon Order": 349,
          "Tier": "B",
          "Base Stats Total": 200,
          "Generation": 3
        },
        {
          
          "Name": "milotic",
          "Pokedex ID": 350,
          "Pokemon Order": 350,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 3
        },
        {
          
          "Name": "castform",
          "Pokedex ID": 351,
          "Pokemon Order": 351,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "kecleon",
          "Pokedex ID": 352,
          "Pokemon Order": 352,
          "Tier": "B",
          "Base Stats Total": 440,
          "Generation": 3
        },
        {
          
          "Name": "shuppet",
          "Pokedex ID": 353,
          "Pokemon Order": 353,
          "Tier": "C",
          "Base Stats Total": 295,
          "Generation": 3
        },
        {
          
          "Name": "banette",
          "Pokedex ID": 354,
          "Pokemon Order": 354,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 3
        },
        {
          
          "Name": "duskull",
          "Pokedex ID": 355,
          "Pokemon Order": 355,
          "Tier": "C",
          "Base Stats Total": 295,
          "Generation": 3
        },
        {
          
          "Name": "dusclops",
          "Pokedex ID": 356,
          "Pokemon Order": 356,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 3
        },
        {
          
          "Name": "tropius",
          "Pokedex ID": 357,
          "Pokemon Order": 357,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 3
        },
        {
          
          "Name": "chimecho",
          "Pokedex ID": 358,
          "Pokemon Order": 358,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 3
        },
        {
          
          "Name": "absol",
          "Pokedex ID": 359,
          "Pokemon Order": 359,
          "Tier": "B",
          "Base Stats Total": 465,
          "Generation": 3
        },
        {
          
          "Name": "wynaut",
          "Pokedex ID": 360,
          "Pokemon Order": 360,
          "Tier": "C",
          "Base Stats Total": 260,
          "Generation": 3
        },
        {
          
          "Name": "snorunt",
          "Pokedex ID": 361,
          "Pokemon Order": 361,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 3
        },
        {
          
          "Name": "glalie",
          "Pokedex ID": 362,
          "Pokemon Order": 362,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 3
        },
        {
          
          "Name": "spheal",
          "Pokedex ID": 363,
          "Pokemon Order": 363,
          "Tier": "C",
          "Base Stats Total": 290,
          "Generation": 3
        },
        {
          
          "Name": "sealeo",
          "Pokedex ID": 364,
          "Pokemon Order": 364,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 3
        },
        {
          
          "Name": "walrein",
          "Pokedex ID": 365,
          "Pokemon Order": 365,
          "Tier": "A",
          "Base Stats Total": 530,
          "Generation": 3
        },
        {
          
          "Name": "clamperl",
          "Pokedex ID": 366,
          "Pokemon Order": 366,
          "Tier": "C",
          "Base Stats Total": 345,
          "Generation": 3
        },
        {
          
          "Name": "huntail",
          "Pokedex ID": 367,
          "Pokemon Order": 367,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 3
        },
        {
          
          "Name": "gorebyss",
          "Pokedex ID": 368,
          "Pokemon Order": 368,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 3
        },
        {
          
          "Name": "relicanth",
          "Pokedex ID": 369,
          "Pokemon Order": 369,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 3
        },
        {
          
          "Name": "luvdisc",
          "Pokedex ID": 370,
          "Pokemon Order": 370,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 3
        },
        {
          
          "Name": "bagon",
          "Pokedex ID": 371,
          "Pokemon Order": 371,
          "Tier": "B",
          "Base Stats Total": 300,
          "Generation": 3
        },
        {
          
          "Name": "shelgon",
          "Pokedex ID": 372,
          "Pokemon Order": 372,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "salamence",
          "Pokedex ID": 373,
          "Pokemon Order": 373,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 3
        },
        {
          
          "Name": "beldum",
          "Pokedex ID": 374,
          "Pokemon Order": 374,
          "Tier": "B",
          "Base Stats Total": 300,
          "Generation": 3
        },
        {
          
          "Name": "metang",
          "Pokedex ID": 375,
          "Pokemon Order": 375,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "metagross",
          "Pokedex ID": 376,
          "Pokemon Order": 376,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 3
        },
        {
          
          "Name": "regirock",
          "Pokedex ID": 377,
          "Pokemon Order": 377,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 3
        },
        {
          
          "Name": "regice",
          "Pokedex ID": 378,
          "Pokemon Order": 378,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 3
        },
        {
          
          "Name": "registeel",
          "Pokedex ID": 379,
          "Pokemon Order": 379,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 3
        },
        {
          
          "Name": "latias",
          "Pokedex ID": 380,
          "Pokemon Order": 380,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 3
        },
        {
          
          "Name": "latios",
          "Pokedex ID": 381,
          "Pokemon Order": 381,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 3
        },
        {
          
          "Name": "kyogre",
          "Pokedex ID": 382,
          "Pokemon Order": 382,
          "Tier": "S",
          "Base Stats Total": 670,
          "Generation": 3
        },
        {
          
          "Name": "groudon",
          "Pokedex ID": 383,
          "Pokemon Order": 383,
          "Tier": "S",
          "Base Stats Total": 670,
          "Generation": 3
        },
        {
          
          "Name": "rayquaza",
          "Pokedex ID": 384,
          "Pokemon Order": 384,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 3
        },
        {
          
          "Name": "jirachi",
          "Pokedex ID": 385,
          "Pokemon Order": 385,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 3
        },
        {
          
          "Name": "deoxys",
          "Pokedex ID": 386,
          "Pokemon Order": 386,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 3
        },
        {
          
          "Name": "turtwig",
          "Pokedex ID": 387,
          "Pokemon Order": 387,
          "Tier": "Starter",
          "Base Stats Total": 318,
          "Generation": 4
        },
        {
          
          "Name": "grotle",
          "Pokedex ID": 388,
          "Pokemon Order": 388,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 4
        },
        {
          
          "Name": "torterra",
          "Pokedex ID": 389,
          "Pokemon Order": 389,
          "Tier": "Starter",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "chimchar",
          "Pokedex ID": 390,
          "Pokemon Order": 390,
          "Tier": "Starter",
          "Base Stats Total": 309,
          "Generation": 4
        },
        {
          
          "Name": "monferno",
          "Pokedex ID": 391,
          "Pokemon Order": 391,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 4
        },
        {
          
          "Name": "infernape",
          "Pokedex ID": 392,
          "Pokemon Order": 392,
          "Tier": "Starter",
          "Base Stats Total": 534,
          "Generation": 4
        },
        {
          
          "Name": "piplup",
          "Pokedex ID": 393,
          "Pokemon Order": 393,
          "Tier": "Starter",
          "Base Stats Total": 314,
          "Generation": 4
        },
        {
          
          "Name": "prinplup",
          "Pokedex ID": 394,
          "Pokemon Order": 394,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 4
        },
        {
          
          "Name": "empoleon",
          "Pokedex ID": 395,
          "Pokemon Order": 395,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 4
        },
        {
          
          "Name": "starly",
          "Pokedex ID": 396,
          "Pokemon Order": 396,
          "Tier": "C",
          "Base Stats Total": 245,
          "Generation": 4
        },
        {
          
          "Name": "staravia",
          "Pokedex ID": 397,
          "Pokemon Order": 397,
          "Tier": "B",
          "Base Stats Total": 340,
          "Generation": 4
        },
        {
          
          "Name": "staraptor",
          "Pokedex ID": 398,
          "Pokemon Order": 398,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 4
        },
        {
          
          "Name": "bidoof",
          "Pokedex ID": 399,
          "Pokemon Order": 399,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 4
        },
        {
          
          "Name": "bibarel",
          "Pokedex ID": 400,
          "Pokemon Order": 400,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 4
        },
        {
          
          "Name": "kricketot",
          "Pokedex ID": 401,
          "Pokemon Order": 401,
          "Tier": "C",
          "Base Stats Total": 194,
          "Generation": 4
        },
        {
          
          "Name": "kricketune",
          "Pokedex ID": 402,
          "Pokemon Order": 402,
          "Tier": "B",
          "Base Stats Total": 384,
          "Generation": 4
        },
        {
          
          "Name": "shinx",
          "Pokedex ID": 403,
          "Pokemon Order": 403,
          "Tier": "C",
          "Base Stats Total": 263,
          "Generation": 4
        },
        {
          
          "Name": "luxio",
          "Pokedex ID": 404,
          "Pokemon Order": 404,
          "Tier": "B",
          "Base Stats Total": 363,
          "Generation": 4
        },
        {
          
          "Name": "luxray",
          "Pokedex ID": 405,
          "Pokemon Order": 405,
          "Tier": "A",
          "Base Stats Total": 523,
          "Generation": 4
        },
        {
          
          "Name": "budew",
          "Pokedex ID": 406,
          "Pokemon Order": 406,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 4
        },
        {
          
          "Name": "roserade",
          "Pokedex ID": 407,
          "Pokemon Order": 407,
          "Tier": "A",
          "Base Stats Total": 515,
          "Generation": 4
        },
        {
          
          "Name": "cranidos",
          "Pokedex ID": 408,
          "Pokemon Order": 408,
          "Tier": "C",
          "Base Stats Total": 350,
          "Generation": 4
        },
        {
          
          "Name": "rampardos",
          "Pokedex ID": 409,
          "Pokemon Order": 409,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 4
        },
        {
          
          "Name": "shieldon",
          "Pokedex ID": 410,
          "Pokemon Order": 410,
          "Tier": "C",
          "Base Stats Total": 350,
          "Generation": 4
        },
        {
          
          "Name": "bastiodon",
          "Pokedex ID": 411,
          "Pokemon Order": 411,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 4
        },
        {
          
          "Name": "burmy",
          "Pokedex ID": 412,
          "Pokemon Order": 412,
          "Tier": "C",
          "Base Stats Total": 224,
          "Generation": 4
        },
        {
          
          "Name": "wormadam",
          "Pokedex ID": 413,
          "Pokemon Order": 413,
          "Tier": "B",
          "Base Stats Total": 424,
          "Generation": 4
        },
        {
          
          "Name": "mothim",
          "Pokedex ID": 414,
          "Pokemon Order": 414,
          "Tier": "B",
          "Base Stats Total": 424,
          "Generation": 4
        },
        {
          
          "Name": "combee",
          "Pokedex ID": 415,
          "Pokemon Order": 415,
          "Tier": "C",
          "Base Stats Total": 244,
          "Generation": 4
        },
        {
          
          "Name": "vespiquen",
          "Pokedex ID": 416,
          "Pokemon Order": 416,
          "Tier": "A",
          "Base Stats Total": 474,
          "Generation": 4
        },
        {
          
          "Name": "pachirisu",
          "Pokedex ID": 417,
          "Pokemon Order": 417,
          "Tier": "C",
          "Base Stats Total": 405,
          "Generation": 4
        },
        {
          
          "Name": "buizel",
          "Pokedex ID": 418,
          "Pokemon Order": 418,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 4
        },
        {
          
          "Name": "floatzel",
          "Pokedex ID": 419,
          "Pokemon Order": 419,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 4
        },
        {
          
          "Name": "cherubi",
          "Pokedex ID": 420,
          "Pokemon Order": 420,
          "Tier": "C",
          "Base Stats Total": 275,
          "Generation": 4
        },
        {
          
          "Name": "cherrim",
          "Pokedex ID": 421,
          "Pokemon Order": 421,
          "Tier": "B",
          "Base Stats Total": 450,
          "Generation": 4
        },
        {
          
          "Name": "shellos",
          "Pokedex ID": 422,
          "Pokemon Order": 422,
          "Tier": "C",
          "Base Stats Total": 325,
          "Generation": 4
        },
        {
          
          "Name": "gastrodon",
          "Pokedex ID": 423,
          "Pokemon Order": 423,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 4
        },
        {
          
          "Name": "ambipom",
          "Pokedex ID": 424,
          "Pokemon Order": 424,
          "Tier": "B",
          "Base Stats Total": 482,
          "Generation": 4
        },
        {
          
          "Name": "drifloon",
          "Pokedex ID": 425,
          "Pokemon Order": 425,
          "Tier": "C",
          "Base Stats Total": 348,
          "Generation": 4
        },
        {
          
          "Name": "drifblim",
          "Pokedex ID": 426,
          "Pokemon Order": 426,
          "Tier": "A",
          "Base Stats Total": 498,
          "Generation": 4
        },
        {
          
          "Name": "buneary",
          "Pokedex ID": 427,
          "Pokemon Order": 427,
          "Tier": "C",
          "Base Stats Total": 350,
          "Generation": 4
        },
        {
          
          "Name": "lopunny",
          "Pokedex ID": 428,
          "Pokemon Order": 428,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 4
        },
        {
          
          "Name": "mismagius",
          "Pokedex ID": 429,
          "Pokemon Order": 429,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 4
        },
        {
          
          "Name": "honchkrow",
          "Pokedex ID": 430,
          "Pokemon Order": 430,
          "Tier": "A",
          "Base Stats Total": 505,
          "Generation": 4
        },
        {
          
          "Name": "glameow",
          "Pokedex ID": 431,
          "Pokemon Order": 431,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 4
        },
        {
          
          "Name": "purugly",
          "Pokedex ID": 432,
          "Pokemon Order": 432,
          "Tier": "B",
          "Base Stats Total": 452,
          "Generation": 4
        },
        {
          
          "Name": "chingling",
          "Pokedex ID": 433,
          "Pokemon Order": 433,
          "Tier": "C",
          "Base Stats Total": 285,
          "Generation": 4
        },
        {
          
          "Name": "stunky",
          "Pokedex ID": 434,
          "Pokemon Order": 434,
          "Tier": "C",
          "Base Stats Total": 329,
          "Generation": 4
        },
        {
          
          "Name": "skuntank",
          "Pokedex ID": 435,
          "Pokemon Order": 435,
          "Tier": "B",
          "Base Stats Total": 479,
          "Generation": 4
        },
        {
          
          "Name": "bronzor",
          "Pokedex ID": 436,
          "Pokemon Order": 436,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 4
        },
        {
          
          "Name": "bronzong",
          "Pokedex ID": 437,
          "Pokemon Order": 437,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 4
        },
        {
          
          "Name": "bonsly",
          "Pokedex ID": 438,
          "Pokemon Order": 438,
          "Tier": "C",
          "Base Stats Total": 290,
          "Generation": 4
        },
        {
          
          "Name": "mime-jr",
          "Pokedex ID": 439,
          "Pokemon Order": 439,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 4
        },
        {
          
          "Name": "happiny",
          "Pokedex ID": 440,
          "Pokemon Order": 440,
          "Tier": "C",
          "Base Stats Total": 220,
          "Generation": 4
        },
        {
          
          "Name": "chatot",
          "Pokedex ID": 441,
          "Pokemon Order": 441,
          "Tier": "C",
          "Base Stats Total": 411,
          "Generation": 4
        },
        {
          
          "Name": "spiritomb",
          "Pokedex ID": 442,
          "Pokemon Order": 442,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 4
        },
        {
          
          "Name": "gible",
          "Pokedex ID": 443,
          "Pokemon Order": 443,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 4
        },
        {
          
          "Name": "gabite",
          "Pokedex ID": 444,
          "Pokemon Order": 444,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 4
        },
        {
          
          "Name": "garchomp",
          "Pokedex ID": 445,
          "Pokemon Order": 445,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 4
        },
        {
          
          "Name": "munchlax",
          "Pokedex ID": 446,
          "Pokemon Order": 446,
          "Tier": "C",
          "Base Stats Total": 390,
          "Generation": 4
        },
        {
          
          "Name": "riolu",
          "Pokedex ID": 447,
          "Pokemon Order": 447,
          "Tier": "B",
          "Base Stats Total": 285,
          "Generation": 4
        },
        {
          
          "Name": "lucario",
          "Pokedex ID": 448,
          "Pokemon Order": 448,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "hippopotas",
          "Pokedex ID": 449,
          "Pokemon Order": 449,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 4
        },
        {
          
          "Name": "hippowdon",
          "Pokedex ID": 450,
          "Pokemon Order": 450,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "skorupi",
          "Pokedex ID": 451,
          "Pokemon Order": 451,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 4
        },
        {
          
          "Name": "drapion",
          "Pokedex ID": 452,
          "Pokemon Order": 452,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 4
        },
        {
          
          "Name": "croagunk",
          "Pokedex ID": 453,
          "Pokemon Order": 453,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 4
        },
        {
          
          "Name": "toxicroak",
          "Pokedex ID": 454,
          "Pokemon Order": 454,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 4
        },
        {
          
          "Name": "carnivine",
          "Pokedex ID": 455,
          "Pokemon Order": 455,
          "Tier": "B",
          "Base Stats Total": 454,
          "Generation": 4
        },
        {
          
          "Name": "finneon",
          "Pokedex ID": 456,
          "Pokemon Order": 456,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 4
        },
        {
          
          "Name": "lumineon",
          "Pokedex ID": 457,
          "Pokemon Order": 457,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 4
        },
        {
          
          "Name": "mantyke",
          "Pokedex ID": 458,
          "Pokemon Order": 458,
          "Tier": "C",
          "Base Stats Total": 345,
          "Generation": 4
        },
        {
          
          "Name": "snover",
          "Pokedex ID": 459,
          "Pokemon Order": 459,
          "Tier": "C",
          "Base Stats Total": 334,
          "Generation": 4
        },
        {
          
          "Name": "abomasnow",
          "Pokedex ID": 460,
          "Pokemon Order": 460,
          "Tier": "A",
          "Base Stats Total": 494,
          "Generation": 4
        },
        {
          
          "Name": "weavile",
          "Pokedex ID": 461,
          "Pokemon Order": 461,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 4
        },
        {
          
          "Name": "magnezone",
          "Pokedex ID": 462,
          "Pokemon Order": 462,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 4
        },
        {
          
          "Name": "lickilicky",
          "Pokedex ID": 463,
          "Pokemon Order": 463,
          "Tier": "A",
          "Base Stats Total": 515,
          "Generation": 4
        },
        {
          
          "Name": "rhyperior",
          "Pokedex ID": 464,
          "Pokemon Order": 464,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 4
        },
        {
          
          "Name": "tangrowth",
          "Pokedex ID": 465,
          "Pokemon Order": 465,
          "Tier": "B",
          "Base Stats Total": 535,
          "Generation": 4
        },
        {
          
          "Name": "electivire",
          "Pokedex ID": 466,
          "Pokemon Order": 466,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 4
        },
        {
          
          "Name": "magmortar",
          "Pokedex ID": 467,
          "Pokemon Order": 467,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 4
        },
        {
          
          "Name": "togekiss",
          "Pokedex ID": 468,
          "Pokemon Order": 468,
          "Tier": "A",
          "Base Stats Total": 545,
          "Generation": 4
        },
        {
          
          "Name": "yanmega",
          "Pokedex ID": 469,
          "Pokemon Order": 469,
          "Tier": "A",
          "Base Stats Total": 515,
          "Generation": 4
        },
        {
          
          "Name": "leafeon",
          "Pokedex ID": 470,
          "Pokemon Order": 470,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "glaceon",
          "Pokedex ID": 471,
          "Pokemon Order": 471,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "gliscor",
          "Pokedex ID": 472,
          "Pokemon Order": 472,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 4
        },
        {
          
          "Name": "mamoswine",
          "Pokedex ID": 473,
          "Pokemon Order": 473,
          "Tier": "A",
          "Base Stats Total": 530,
          "Generation": 4
        },
        {
          
          "Name": "porygon-z",
          "Pokedex ID": 474,
          "Pokemon Order": 474,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 4
        },
        {
          
          "Name": "gallade",
          "Pokedex ID": 475,
          "Pokemon Order": 475,
          "Tier": "A",
          "Base Stats Total": 518,
          "Generation": 4
        },
        {
          
          "Name": "probopass",
          "Pokedex ID": 476,
          "Pokemon Order": 476,
          "Tier": "B",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "dusknoir",
          "Pokedex ID": 477,
          "Pokemon Order": 477,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "froslass",
          "Pokedex ID": 478,
          "Pokemon Order": 478,
          "Tier": "A",
          "Base Stats Total": 480,
          "Generation": 4
        },
        {
          
          "Name": "rotom",
          "Pokedex ID": 479,
          "Pokemon Order": 479,
          "Tier": "A",
          "Base Stats Total": 440,
          "Generation": 4
        },
        {
          
          "Name": "uxie",
          "Pokedex ID": 480,
          "Pokemon Order": 480,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 4
        },
        {
          
          "Name": "mesprit",
          "Pokedex ID": 481,
          "Pokemon Order": 481,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 4
        },
        {
          
          "Name": "azelf",
          "Pokedex ID": 482,
          "Pokemon Order": 482,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 4
        },
        {
          
          "Name": "dialga",
          "Pokedex ID": 483,
          "Pokemon Order": 483,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 4
        },
        {
          
          "Name": "palkia",
          "Pokedex ID": 484,
          "Pokemon Order": 484,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 4
        },
        {
          
          "Name": "heatran",
          "Pokedex ID": 485,
          "Pokemon Order": 485,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 4
        },
        {
          
          "Name": "regigigas",
          "Pokedex ID": 486,
          "Pokemon Order": 486,
          "Tier": "S",
          "Base Stats Total": 670,
          "Generation": 4
        },
        {
          
          "Name": "giratina",
          "Pokedex ID": 487,
          "Pokemon Order": 487,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 4
        },
        {
          
          "Name": "cresselia",
          "Pokedex ID": 488,
          "Pokemon Order": 488,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 4
        },
        {
          
          "Name": "phione",
          "Pokedex ID": 489,
          "Pokemon Order": 489,
          "Tier": "S",
          "Base Stats Total": 480,
          "Generation": 4
        },
        {
          
          "Name": "manaphy",
          "Pokedex ID": 490,
          "Pokemon Order": 490,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 4
        },
        {
          
          "Name": "darkrai",
          "Pokedex ID": 491,
          "Pokemon Order": 491,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 4
        },
        {
          
          "Name": "shaymin",
          "Pokedex ID": 492,
          "Pokemon Order": 492,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 4
        },
        {
          
          "Name": "arceus",
          "Pokedex ID": 493,
          "Pokemon Order": 493,
          "Tier": "S",
          "Base Stats Total": 720,
          "Generation": 4
        },
        {
          
          "Name": "victini",
          "Pokedex ID": 494,
          "Pokemon Order": 494,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 5
        },
        {
          
          "Name": "snivy",
          "Pokedex ID": 495,
          "Pokemon Order": 495,
          "Tier": "Starter",
          "Base Stats Total": 308,
          "Generation": 5
        },
        {
          
          "Name": "servine",
          "Pokedex ID": 496,
          "Pokemon Order": 496,
          "Tier": "Starter",
          "Base Stats Total": 413,
          "Generation": 5
        },
        {
          
          "Name": "serperior",
          "Pokedex ID": 497,
          "Pokemon Order": 497,
          "Tier": "Starter",
          "Base Stats Total": 528,
          "Generation": 5
        },
        {
          
          "Name": "tepig",
          "Pokedex ID": 498,
          "Pokemon Order": 498,
          "Tier": "Starter",
          "Base Stats Total": 308,
          "Generation": 5
        },
        {
          
          "Name": "pignite",
          "Pokedex ID": 499,
          "Pokemon Order": 499,
          "Tier": "Starter",
          "Base Stats Total": 418,
          "Generation": 5
        },
        {
          
          "Name": "emboar",
          "Pokedex ID": 500,
          "Pokemon Order": 500,
          "Tier": "Starter",
          "Base Stats Total": 528,
          "Generation": 5
        },
        {
          
          "Name": "oshawott",
          "Pokedex ID": 501,
          "Pokemon Order": 501,
          "Tier": "Starter",
          "Base Stats Total": 308,
          "Generation": 5
        },
        {
          
          "Name": "dewott",
          "Pokedex ID": 502,
          "Pokemon Order": 502,
          "Tier": "Starter",
          "Base Stats Total": 413,
          "Generation": 5
        },
        {
          
          "Name": "samurott",
          "Pokedex ID": 503,
          "Pokemon Order": 503,
          "Tier": "Starter",
          "Base Stats Total": 528,
          "Generation": 5
        },
        {
          
          "Name": "patrat",
          "Pokedex ID": 504,
          "Pokemon Order": 504,
          "Tier": "C",
          "Base Stats Total": 255,
          "Generation": 5
        },
        {
          
          "Name": "watchog",
          "Pokedex ID": 505,
          "Pokemon Order": 505,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 5
        },
        {
          
          "Name": "lillipup",
          "Pokedex ID": 506,
          "Pokemon Order": 506,
          "Tier": "C",
          "Base Stats Total": 275,
          "Generation": 5
        },
        {
          
          "Name": "herdier",
          "Pokedex ID": 507,
          "Pokemon Order": 507,
          "Tier": "B",
          "Base Stats Total": 370,
          "Generation": 5
        },
        {
          
          "Name": "stoutland",
          "Pokedex ID": 508,
          "Pokemon Order": 508,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 5
        },
        {
          
          "Name": "purrloin",
          "Pokedex ID": 509,
          "Pokemon Order": 509,
          "Tier": "C",
          "Base Stats Total": 281,
          "Generation": 5
        },
        {
          
          "Name": "liepard",
          "Pokedex ID": 510,
          "Pokemon Order": 510,
          "Tier": "B",
          "Base Stats Total": 446,
          "Generation": 5
        },
        {
          
          "Name": "pansage",
          "Pokedex ID": 511,
          "Pokemon Order": 511,
          "Tier": "C",
          "Base Stats Total": 316,
          "Generation": 5
        },
        {
          
          "Name": "simisage",
          "Pokedex ID": 512,
          "Pokemon Order": 512,
          "Tier": "B",
          "Base Stats Total": 498,
          "Generation": 5
        },
        {
          
          "Name": "pansear",
          "Pokedex ID": 513,
          "Pokemon Order": 513,
          "Tier": "C",
          "Base Stats Total": 316,
          "Generation": 5
        },
        {
          
          "Name": "simisear",
          "Pokedex ID": 514,
          "Pokemon Order": 514,
          "Tier": "B",
          "Base Stats Total": 498,
          "Generation": 5
        },
        {
          
          "Name": "panpour",
          "Pokedex ID": 515,
          "Pokemon Order": 515,
          "Tier": "C",
          "Base Stats Total": 316,
          "Generation": 5
        },
        {
          
          "Name": "simipour",
          "Pokedex ID": 516,
          "Pokemon Order": 516,
          "Tier": "B",
          "Base Stats Total": 498,
          "Generation": 5
        },
        {
          
          "Name": "munna",
          "Pokedex ID": 517,
          "Pokemon Order": 517,
          "Tier": "C",
          "Base Stats Total": 292,
          "Generation": 5
        },
        {
          
          "Name": "musharna",
          "Pokedex ID": 518,
          "Pokemon Order": 518,
          "Tier": "B",
          "Base Stats Total": 487,
          "Generation": 5
        },
        {
          
          "Name": "pidove",
          "Pokedex ID": 519,
          "Pokemon Order": 519,
          "Tier": "C",
          "Base Stats Total": 264,
          "Generation": 5
        },
        {
          
          "Name": "tranquill",
          "Pokedex ID": 520,
          "Pokemon Order": 520,
          "Tier": "B",
          "Base Stats Total": 358,
          "Generation": 5
        },
        {
          
          "Name": "unfezant",
          "Pokedex ID": 521,
          "Pokemon Order": 521,
          "Tier": "B",
          "Base Stats Total": 488,
          "Generation": 5
        },
        {
          
          "Name": "blitzle",
          "Pokedex ID": 522,
          "Pokemon Order": 522,
          "Tier": "C",
          "Base Stats Total": 295,
          "Generation": 5
        },
        {
          
          "Name": "zebstrika",
          "Pokedex ID": 523,
          "Pokemon Order": 523,
          "Tier": "B",
          "Base Stats Total": 497,
          "Generation": 5
        },
        {
          
          "Name": "roggenrola",
          "Pokedex ID": 524,
          "Pokemon Order": 524,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 5
        },
        {
          
          "Name": "boldore",
          "Pokedex ID": 525,
          "Pokemon Order": 525,
          "Tier": "B",
          "Base Stats Total": 390,
          "Generation": 5
        },
        {
          
          "Name": "gigalith",
          "Pokedex ID": 526,
          "Pokemon Order": 526,
          "Tier": "A",
          "Base Stats Total": 515,
          "Generation": 5
        },
        {
          
          "Name": "woobat",
          "Pokedex ID": 527,
          "Pokemon Order": 527,
          "Tier": "C",
          "Base Stats Total": 323,
          "Generation": 5
        },
        {
          
          "Name": "swoobat",
          "Pokedex ID": 528,
          "Pokemon Order": 528,
          "Tier": "B",
          "Base Stats Total": 425,
          "Generation": 5
        },
        {
          
          "Name": "drilbur",
          "Pokedex ID": 529,
          "Pokemon Order": 529,
          "Tier": "C",
          "Base Stats Total": 328,
          "Generation": 5
        },
        {
          
          "Name": "excadrill",
          "Pokedex ID": 530,
          "Pokemon Order": 530,
          "Tier": "A",
          "Base Stats Total": 508,
          "Generation": 5
        },
        {
          
          "Name": "audino",
          "Pokedex ID": 531,
          "Pokemon Order": 531,
          "Tier": "B",
          "Base Stats Total": 445,
          "Generation": 5
        },
        {
          
          "Name": "timburr",
          "Pokedex ID": 532,
          "Pokemon Order": 532,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 5
        },
        {
          
          "Name": "gurdurr",
          "Pokedex ID": 533,
          "Pokemon Order": 533,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 5
        },
        {
          
          "Name": "conkeldurr",
          "Pokedex ID": 534,
          "Pokemon Order": 534,
          "Tier": "A",
          "Base Stats Total": 505,
          "Generation": 5
        },
        {
          
          "Name": "tympole",
          "Pokedex ID": 535,
          "Pokemon Order": 535,
          "Tier": "C",
          "Base Stats Total": 294,
          "Generation": 5
        },
        {
          
          "Name": "palpitoad",
          "Pokedex ID": 536,
          "Pokemon Order": 536,
          "Tier": "B",
          "Base Stats Total": 384,
          "Generation": 5
        },
        {
          
          "Name": "seismitoad",
          "Pokedex ID": 537,
          "Pokemon Order": 537,
          "Tier": "A",
          "Base Stats Total": 509,
          "Generation": 5
        },
        {
          
          "Name": "throh",
          "Pokedex ID": 538,
          "Pokemon Order": 538,
          "Tier": "B",
          "Base Stats Total": 465,
          "Generation": 5
        },
        {
          
          "Name": "sawk",
          "Pokedex ID": 539,
          "Pokemon Order": 539,
          "Tier": "B",
          "Base Stats Total": 465,
          "Generation": 5
        },
        {
          
          "Name": "sewaddle",
          "Pokedex ID": 540,
          "Pokemon Order": 540,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 5
        },
        {
          
          "Name": "swadloon",
          "Pokedex ID": 541,
          "Pokemon Order": 541,
          "Tier": "B",
          "Base Stats Total": 380,
          "Generation": 5
        },
        {
          
          "Name": "leavanny",
          "Pokedex ID": 542,
          "Pokemon Order": 542,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 5
        },
        {
          
          "Name": "venipede",
          "Pokedex ID": 543,
          "Pokemon Order": 543,
          "Tier": "C",
          "Base Stats Total": 260,
          "Generation": 5
        },
        {
          
          "Name": "whirlipede",
          "Pokedex ID": 544,
          "Pokemon Order": 544,
          "Tier": "B",
          "Base Stats Total": 360,
          "Generation": 5
        },
        {
          
          "Name": "scolipede",
          "Pokedex ID": 545,
          "Pokemon Order": 545,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 5
        },
        {
          
          "Name": "cottonee",
          "Pokedex ID": 546,
          "Pokemon Order": 546,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 5
        },
        {
          
          "Name": "whimsicott",
          "Pokedex ID": 547,
          "Pokemon Order": 547,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 5
        },
        {
          
          "Name": "petilil",
          "Pokedex ID": 548,
          "Pokemon Order": 548,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 5
        },
        {
          
          "Name": "lilligant",
          "Pokedex ID": 549,
          "Pokemon Order": 549,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 5
        },
        {
          
          "Name": "basculin",
          "Pokedex ID": 550,
          "Pokemon Order": 550,
          "Tier": "C",
          "Base Stats Total": 460,
          "Generation": 5
        },
        {
          
          "Name": "sandile",
          "Pokedex ID": 551,
          "Pokemon Order": 551,
          "Tier": "C",
          "Base Stats Total": 292,
          "Generation": 5
        },
        {
          
          "Name": "krokorok",
          "Pokedex ID": 552,
          "Pokemon Order": 552,
          "Tier": "B",
          "Base Stats Total": 351,
          "Generation": 5
        },
        {
          
          "Name": "krookodile",
          "Pokedex ID": 553,
          "Pokemon Order": 553,
          "Tier": "A",
          "Base Stats Total": 519,
          "Generation": 5
        },
        {
          
          "Name": "darumaka",
          "Pokedex ID": 554,
          "Pokemon Order": 554,
          "Tier": "C",
          "Base Stats Total": 315,
          "Generation": 5
        },
        {
          
          "Name": "darmanitan",
          "Pokedex ID": 555,
          "Pokemon Order": 555,
          "Tier": "A",
          "Base Stats Total": 480,
          "Generation": 5
        },
        {
          
          "Name": "maractus",
          "Pokedex ID": 556,
          "Pokemon Order": 556,
          "Tier": "C",
          "Base Stats Total": 461,
          "Generation": 5
        },
        {
          
          "Name": "dwebble",
          "Pokedex ID": 557,
          "Pokemon Order": 557,
          "Tier": "C",
          "Base Stats Total": 325,
          "Generation": 5
        },
        {
          
          "Name": "crustle",
          "Pokedex ID": 558,
          "Pokemon Order": 558,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 5
        },
        {
          
          "Name": "scraggy",
          "Pokedex ID": 559,
          "Pokemon Order": 559,
          "Tier": "C",
          "Base Stats Total": 348,
          "Generation": 5
        },
        {
          
          "Name": "scrafty",
          "Pokedex ID": 560,
          "Pokemon Order": 560,
          "Tier": "B",
          "Base Stats Total": 488,
          "Generation": 5
        },
        {
          
          "Name": "sigilyph",
          "Pokedex ID": 561,
          "Pokemon Order": 561,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 5
        },
        {
          
          "Name": "yamask",
          "Pokedex ID": 562,
          "Pokemon Order": 562,
          "Tier": "B",
          "Base Stats Total": 303,
          "Generation": 5
        },
        {
          
          "Name": "cofagrigus",
          "Pokedex ID": 563,
          "Pokemon Order": 563,
          "Tier": "A",
          "Base Stats Total": 483,
          "Generation": 5
        },
        {
          
          "Name": "tirtouga",
          "Pokedex ID": 564,
          "Pokemon Order": 564,
          "Tier": "C",
          "Base Stats Total": 355,
          "Generation": 5
        },
        {
          
          "Name": "carracosta",
          "Pokedex ID": 565,
          "Pokemon Order": 565,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 5
        },
        {
          
          "Name": "archen",
          "Pokedex ID": 566,
          "Pokemon Order": 566,
          "Tier": "C",
          "Base Stats Total": 401,
          "Generation": 5
        },
        {
          
          "Name": "archeops",
          "Pokedex ID": 567,
          "Pokemon Order": 567,
          "Tier": "A",
          "Base Stats Total": 567,
          "Generation": 5
        },
        {
          
          "Name": "trubbish",
          "Pokedex ID": 568,
          "Pokemon Order": 568,
          "Tier": "C",
          "Base Stats Total": 329,
          "Generation": 5
        },
        {
          
          "Name": "garbodor",
          "Pokedex ID": 569,
          "Pokemon Order": 569,
          "Tier": "B",
          "Base Stats Total": 474,
          "Generation": 5
        },
        {
          
          "Name": "zorua",
          "Pokedex ID": 570,
          "Pokemon Order": 570,
          "Tier": "B",
          "Base Stats Total": 330,
          "Generation": 5
        },
        {
          
          "Name": "zoroark",
          "Pokedex ID": 571,
          "Pokemon Order": 571,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 5
        },
        {
          
          "Name": "minccino",
          "Pokedex ID": 572,
          "Pokemon Order": 572,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 5
        },
        {
          
          "Name": "cinccino",
          "Pokedex ID": 573,
          "Pokemon Order": 573,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 5
        },
        {
          
          "Name": "gothita",
          "Pokedex ID": 574,
          "Pokemon Order": 574,
          "Tier": "C",
          "Base Stats Total": 290,
          "Generation": 5
        },
        {
          
          "Name": "gothorita",
          "Pokedex ID": 575,
          "Pokemon Order": 575,
          "Tier": "B",
          "Base Stats Total": 390,
          "Generation": 5
        },
        {
          
          "Name": "gothitelle",
          "Pokedex ID": 576,
          "Pokemon Order": 576,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 5
        },
        {
          
          "Name": "solosis",
          "Pokedex ID": 577,
          "Pokemon Order": 577,
          "Tier": "C",
          "Base Stats Total": 290,
          "Generation": 5
        },
        {
          
          "Name": "duosion",
          "Pokedex ID": 578,
          "Pokemon Order": 578,
          "Tier": "B",
          "Base Stats Total": 370,
          "Generation": 5
        },
        {
          
          "Name": "reuniclus",
          "Pokedex ID": 579,
          "Pokemon Order": 579,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 5
        },
        {
          
          "Name": "ducklett",
          "Pokedex ID": 580,
          "Pokemon Order": 580,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 5
        },
        {
          
          "Name": "swanna",
          "Pokedex ID": 581,
          "Pokemon Order": 581,
          "Tier": "B",
          "Base Stats Total": 473,
          "Generation": 5
        },
        {
          
          "Name": "vanillite",
          "Pokedex ID": 582,
          "Pokemon Order": 582,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 5
        },
        {
          
          "Name": "vanillish",
          "Pokedex ID": 583,
          "Pokemon Order": 583,
          "Tier": "B",
          "Base Stats Total": 395,
          "Generation": 5
        },
        {
          
          "Name": "vanilluxe",
          "Pokedex ID": 584,
          "Pokemon Order": 584,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 5
        },
        {
          
          "Name": "deerling",
          "Pokedex ID": 585,
          "Pokemon Order": 585,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 5
        },
        {
          
          "Name": "sawsbuck",
          "Pokedex ID": 586,
          "Pokemon Order": 586,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 5
        },
        {
          
          "Name": "emolga",
          "Pokedex ID": 587,
          "Pokemon Order": 587,
          "Tier": "B",
          "Base Stats Total": 428,
          "Generation": 5
        },
        {
          
          "Name": "karrablast",
          "Pokedex ID": 588,
          "Pokemon Order": 588,
          "Tier": "C",
          "Base Stats Total": 315,
          "Generation": 5
        },
        {
          
          "Name": "escavalier",
          "Pokedex ID": 589,
          "Pokemon Order": 589,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 5
        },
        {
          
          "Name": "foongus",
          "Pokedex ID": 590,
          "Pokemon Order": 590,
          "Tier": "C",
          "Base Stats Total": 294,
          "Generation": 5
        },
        {
          
          "Name": "amoonguss",
          "Pokedex ID": 591,
          "Pokemon Order": 591,
          "Tier": "B",
          "Base Stats Total": 464,
          "Generation": 5
        },
        {
          
          "Name": "frillish",
          "Pokedex ID": 592,
          "Pokemon Order": 592,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 5
        },
        {
          
          "Name": "jellicent",
          "Pokedex ID": 593,
          "Pokemon Order": 593,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 5
        },
        {
          
          "Name": "alomomola",
          "Pokedex ID": 594,
          "Pokemon Order": 594,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 5
        },
        {
          
          "Name": "joltik",
          "Pokedex ID": 595,
          "Pokemon Order": 595,
          "Tier": "C",
          "Base Stats Total": 319,
          "Generation": 5
        },
        {
          
          "Name": "galvantula",
          "Pokedex ID": 596,
          "Pokemon Order": 596,
          "Tier": "B",
          "Base Stats Total": 472,
          "Generation": 5
        },
        {
          
          "Name": "ferroseed",
          "Pokedex ID": 597,
          "Pokemon Order": 597,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 5
        },
        {
          
          "Name": "ferrothorn",
          "Pokedex ID": 598,
          "Pokemon Order": 598,
          "Tier": "A",
          "Base Stats Total": 489,
          "Generation": 5
        },
        {
          
          "Name": "klink",
          "Pokedex ID": 599,
          "Pokemon Order": 599,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 5
        },
        {
          
          "Name": "klang",
          "Pokedex ID": 600,
          "Pokemon Order": 600,
          "Tier": "B",
          "Base Stats Total": 440,
          "Generation": 5
        },
        {
          
          "Name": "klinklang",
          "Pokedex ID": 601,
          "Pokemon Order": 601,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 5
        },
        {
          
          "Name": "tynamo",
          "Pokedex ID": 602,
          "Pokemon Order": 602,
          "Tier": "C",
          "Base Stats Total": 275,
          "Generation": 5
        },
        {
          
          "Name": "eelektrik",
          "Pokedex ID": 603,
          "Pokemon Order": 603,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 5
        },
        {
          
          "Name": "eelektross",
          "Pokedex ID": 604,
          "Pokemon Order": 604,
          "Tier": "A",
          "Base Stats Total": 515,
          "Generation": 5
        },
        {
          
          "Name": "elgyem",
          "Pokedex ID": 605,
          "Pokemon Order": 605,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 5
        },
        {
          
          "Name": "beheeyem",
          "Pokedex ID": 606,
          "Pokemon Order": 606,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 5
        },
        {
          
          "Name": "litwick",
          "Pokedex ID": 607,
          "Pokemon Order": 607,
          "Tier": "C",
          "Base Stats Total": 275,
          "Generation": 5
        },
        {
          
          "Name": "lampent",
          "Pokedex ID": 608,
          "Pokemon Order": 608,
          "Tier": "B",
          "Base Stats Total": 370,
          "Generation": 5
        },
        {
          
          "Name": "chandelure",
          "Pokedex ID": 609,
          "Pokemon Order": 609,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 5
        },
        {
          
          "Name": "axew",
          "Pokedex ID": 610,
          "Pokemon Order": 610,
          "Tier": "B",
          "Base Stats Total": 320,
          "Generation": 5
        },
        {
          
          "Name": "fraxure",
          "Pokedex ID": 611,
          "Pokemon Order": 611,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 5
        },
        {
          
          "Name": "haxorus",
          "Pokedex ID": 612,
          "Pokemon Order": 612,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 5
        },
        {
          
          "Name": "cubchoo",
          "Pokedex ID": 613,
          "Pokemon Order": 613,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 5
        },
        {
          
          "Name": "beartic",
          "Pokedex ID": 614,
          "Pokemon Order": 614,
          "Tier": "B",
          "Base Stats Total": 505,
          "Generation": 5
        },
        {
          
          "Name": "cryogonal",
          "Pokedex ID": 615,
          "Pokemon Order": 615,
          "Tier": "B",
          "Base Stats Total": 515,
          "Generation": 5
        },
        {
          
          "Name": "shelmet",
          "Pokedex ID": 616,
          "Pokemon Order": 616,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 5
        },
        {
          
          "Name": "accelgor",
          "Pokedex ID": 617,
          "Pokemon Order": 617,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 5
        },
        {
          
          "Name": "stunfisk",
          "Pokedex ID": 618,
          "Pokemon Order": 618,
          "Tier": "C",
          "Base Stats Total": 471,
          "Generation": 5
        },
        {
          
          "Name": "mienfoo",
          "Pokedex ID": 619,
          "Pokemon Order": 619,
          "Tier": "C",
          "Base Stats Total": 350,
          "Generation": 5
        },
        {
          
          "Name": "mienshao",
          "Pokedex ID": 620,
          "Pokemon Order": 620,
          "Tier": "B",
          "Base Stats Total": 510,
          "Generation": 5
        },
        {
          
          "Name": "druddigon",
          "Pokedex ID": 621,
          "Pokemon Order": 621,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 5
        },
        {
          
          "Name": "golett",
          "Pokedex ID": 622,
          "Pokemon Order": 622,
          "Tier": "C",
          "Base Stats Total": 303,
          "Generation": 5
        },
        {
          
          "Name": "golurk",
          "Pokedex ID": 623,
          "Pokemon Order": 623,
          "Tier": "A",
          "Base Stats Total": 483,
          "Generation": 5
        },
        {
          
          "Name": "pawniard",
          "Pokedex ID": 624,
          "Pokemon Order": 624,
          "Tier": "C",
          "Base Stats Total": 340,
          "Generation": 5
        },
        {
          
          "Name": "bisharp",
          "Pokedex ID": 625,
          "Pokemon Order": 625,
          "Tier": "A",
          "Base Stats Total": 490,
          "Generation": 5
        },
        {
          
          "Name": "bouffalant",
          "Pokedex ID": 626,
          "Pokemon Order": 626,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 5
        },
        {
          
          "Name": "rufflet",
          "Pokedex ID": 627,
          "Pokemon Order": 627,
          "Tier": "C",
          "Base Stats Total": 350,
          "Generation": 5
        },
        {
          
          "Name": "braviary",
          "Pokedex ID": 628,
          "Pokemon Order": 628,
          "Tier": "B",
          "Base Stats Total": 510,
          "Generation": 5
        },
        {
          
          "Name": "vullaby",
          "Pokedex ID": 629,
          "Pokemon Order": 629,
          "Tier": "C",
          "Base Stats Total": 370,
          "Generation": 5
        },
        {
          
          "Name": "mandibuzz",
          "Pokedex ID": 630,
          "Pokemon Order": 630,
          "Tier": "B",
          "Base Stats Total": 510,
          "Generation": 5
        },
        {
          
          "Name": "heatmor",
          "Pokedex ID": 631,
          "Pokemon Order": 631,
          "Tier": "B",
          "Base Stats Total": 484,
          "Generation": 5
        },
        {
          
          "Name": "durant",
          "Pokedex ID": 632,
          "Pokemon Order": 632,
          "Tier": "B",
          "Base Stats Total": 484,
          "Generation": 5
        },
        {
          
          "Name": "deino",
          "Pokedex ID": 633,
          "Pokemon Order": 633,
          "Tier": "B",
          "Base Stats Total": 300,
          "Generation": 5
        },
        {
          
          "Name": "zweilous",
          "Pokedex ID": 634,
          "Pokemon Order": 634,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 5
        },
        {
          
          "Name": "hydreigon",
          "Pokedex ID": 635,
          "Pokemon Order": 635,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 5
        },
        {
          
          "Name": "larvesta",
          "Pokedex ID": 636,
          "Pokemon Order": 636,
          "Tier": "B",
          "Base Stats Total": 360,
          "Generation": 5
        },
        {
          
          "Name": "volcarona",
          "Pokedex ID": 637,
          "Pokemon Order": 637,
          "Tier": "A",
          "Base Stats Total": 550,
          "Generation": 5
        },
        {
          
          "Name": "cobalion",
          "Pokedex ID": 638,
          "Pokemon Order": 638,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 5
        },
        {
          
          "Name": "terrakion",
          "Pokedex ID": 639,
          "Pokemon Order": 639,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 5
        },
        {
          
          "Name": "virizion",
          "Pokedex ID": 640,
          "Pokemon Order": 640,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 5
        },
        {
          
          "Name": "tornadus",
          "Pokedex ID": 641,
          "Pokemon Order": 641,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 5
        },
        {
          
          "Name": "thundurus",
          "Pokedex ID": 642,
          "Pokemon Order": 642,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 5
        },
        {
          
          "Name": "reshiram",
          "Pokedex ID": 643,
          "Pokemon Order": 643,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 5
        },
        {
          
          "Name": "zekrom",
          "Pokedex ID": 644,
          "Pokemon Order": 644,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 5
        },
        {
          
          "Name": "landorus",
          "Pokedex ID": 645,
          "Pokemon Order": 645,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 5
        },
        {
          
          "Name": "kyurem",
          "Pokedex ID": 646,
          "Pokemon Order": 646,
          "Tier": "S",
          "Base Stats Total": 660,
          "Generation": 5
        },
        {
          
          "Name": "keldeo",
          "Pokedex ID": 647,
          "Pokemon Order": 647,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 5
        },
        {
          
          "Name": "meloetta",
          "Pokedex ID": 648,
          "Pokemon Order": 648,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 5
        },
        {
          
          "Name": "genesect",
          "Pokedex ID": 649,
          "Pokemon Order": 649,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 5
        },
        {
          
          "Name": "chespin",
          "Pokedex ID": 650,
          "Pokemon Order": 650,
          "Tier": "Starter",
          "Base Stats Total": 313,
          "Generation": 6
        },
        {
          
          "Name": "quilladin",
          "Pokedex ID": 651,
          "Pokemon Order": 651,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 6
        },
        {
          
          "Name": "chesnaught",
          "Pokedex ID": 652,
          "Pokemon Order": 652,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 6
        },
        {
          
          "Name": "fennekin",
          "Pokedex ID": 653,
          "Pokemon Order": 653,
          "Tier": "Starter",
          "Base Stats Total": 307,
          "Generation": 6
        },
        {
          
          "Name": "braixen",
          "Pokedex ID": 654,
          "Pokemon Order": 654,
          "Tier": "Starter",
          "Base Stats Total": 409,
          "Generation": 6
        },
        {
          
          "Name": "delphox",
          "Pokedex ID": 655,
          "Pokemon Order": 655,
          "Tier": "Starter",
          "Base Stats Total": 534,
          "Generation": 6
        },
        {
          
          "Name": "froakie",
          "Pokedex ID": 656,
          "Pokemon Order": 656,
          "Tier": "Starter",
          "Base Stats Total": 314,
          "Generation": 6
        },
        {
          
          "Name": "frogadier",
          "Pokedex ID": 657,
          "Pokemon Order": 657,
          "Tier": "Starter",
          "Base Stats Total": 405,
          "Generation": 6
        },
        {
          
          "Name": "greninja",
          "Pokedex ID": 658,
          "Pokemon Order": 658,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 6
        },
        {
          
          "Name": "bunnelby",
          "Pokedex ID": 659,
          "Pokemon Order": 659,
          "Tier": "C",
          "Base Stats Total": 237,
          "Generation": 6
        },
        {
          
          "Name": "diggersby",
          "Pokedex ID": 660,
          "Pokemon Order": 660,
          "Tier": "B",
          "Base Stats Total": 423,
          "Generation": 6
        },
        {
          
          "Name": "fletchling",
          "Pokedex ID": 661,
          "Pokemon Order": 661,
          "Tier": "C",
          "Base Stats Total": 278,
          "Generation": 6
        },
        {
          
          "Name": "fletchinder",
          "Pokedex ID": 662,
          "Pokemon Order": 662,
          "Tier": "B",
          "Base Stats Total": 382,
          "Generation": 6
        },
        {
          
          "Name": "talonflame",
          "Pokedex ID": 663,
          "Pokemon Order": 663,
          "Tier": "A",
          "Base Stats Total": 499,
          "Generation": 6
        },
        {
          
          "Name": "scatterbug",
          "Pokedex ID": 664,
          "Pokemon Order": 664,
          "Tier": "C",
          "Base Stats Total": 200,
          "Generation": 6
        },
        {
          
          "Name": "spewpa",
          "Pokedex ID": 665,
          "Pokemon Order": 665,
          "Tier": "B",
          "Base Stats Total": 213,
          "Generation": 6
        },
        {
          
          "Name": "vivillon",
          "Pokedex ID": 666,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "litleo",
          "Pokedex ID": 667,
          "Pokemon Order": 667,
          "Tier": "C",
          "Base Stats Total": 369,
          "Generation": 6
        },
        {
          
          "Name": "pyroar",
          "Pokedex ID": 668,
          "Pokemon Order": 668,
          "Tier": "A",
          "Base Stats Total": 507,
          "Generation": 6
        },
        {
          
          "Name": "flabebe",
          "Pokedex ID": 669,
          "Pokemon Order": 669,
          "Tier": "C",
          "Base Stats Total": 303,
          "Generation": 6
        },
        {
          
          "Name": "floette",
          "Pokedex ID": 670,
          "Pokemon Order": 670,
          "Tier": "B",
          "Base Stats Total": 371,
          "Generation": 6
        },
        {
          
          "Name": "florges",
          "Pokedex ID": 671,
          "Pokemon Order": 671,
          "Tier": "A",
          "Base Stats Total": 552,
          "Generation": 6
        },
        {
          
          "Name": "skiddo",
          "Pokedex ID": 672,
          "Pokemon Order": 672,
          "Tier": "C",
          "Base Stats Total": 350,
          "Generation": 6
        },
        {
          
          "Name": "gogoat",
          "Pokedex ID": 673,
          "Pokemon Order": 673,
          "Tier": "B",
          "Base Stats Total": 531,
          "Generation": 6
        },
        {
          
          "Name": "pancham",
          "Pokedex ID": 674,
          "Pokemon Order": 674,
          "Tier": "C",
          "Base Stats Total": 348,
          "Generation": 6
        },
        {
          
          "Name": "pangoro",
          "Pokedex ID": 675,
          "Pokemon Order": 675,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 6
        },
        {
          
          "Name": "furfrou",
          "Pokedex ID": 676,
          "Pokemon Order": 676,
          "Tier": "C",
          "Base Stats Total": 472,
          "Generation": 6
        },
        {
          
          "Name": "espurr",
          "Pokedex ID": 677,
          "Pokemon Order": 677,
          "Tier": "C",
          "Base Stats Total": 355,
          "Generation": 6
        },
        {
          
          "Name": "meowstic",
          "Pokedex ID": 678,
          "Pokemon Order": 678,
          "Tier": "B",
          "Base Stats Total": 466,
          "Generation": 6
        },
        {
          
          "Name": "honedge",
          "Pokedex ID": 679,
          "Pokemon Order": 679,
          "Tier": "B",
          "Base Stats Total": 325,
          "Generation": 6
        },
        {
          
          "Name": "doublade",
          "Pokedex ID": 680,
          "Pokemon Order": 680,
          "Tier": "B",
          "Base Stats Total": 448,
          "Generation": 6
        },
        {
          
          "Name": "aegislash",
          "Pokedex ID": 681,
          "Pokemon Order": 681,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 6
        },
        {
          
          "Name": "spritzee",
          "Pokedex ID": 682,
          "Pokemon Order": 682,
          "Tier": "C",
          "Base Stats Total": 341,
          "Generation": 6
        },
        {
          
          "Name": "aromatisse",
          "Pokedex ID": 683,
          "Pokemon Order": 683,
          "Tier": "B",
          "Base Stats Total": 462,
          "Generation": 6
        },
        {
          
          "Name": "swirlix",
          "Pokedex ID": 684,
          "Pokemon Order": 684,
          "Tier": "C",
          "Base Stats Total": 341,
          "Generation": 6
        },
        {
          
          "Name": "slurpuff",
          "Pokedex ID": 685,
          "Pokemon Order": 685,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 6
        },
        {
          
          "Name": "inkay",
          "Pokedex ID": 686,
          "Pokemon Order": 686,
          "Tier": "C",
          "Base Stats Total": 288,
          "Generation": 6
        },
        {
          
          "Name": "malamar",
          "Pokedex ID": 687,
          "Pokemon Order": 687,
          "Tier": "B",
          "Base Stats Total": 482,
          "Generation": 6
        },
        {
          
          "Name": "binacle",
          "Pokedex ID": 688,
          "Pokemon Order": 688,
          "Tier": "C",
          "Base Stats Total": 306,
          "Generation": 6
        },
        {
          
          "Name": "barbaracle",
          "Pokedex ID": 689,
          "Pokemon Order": 689,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 6
        },
        {
          
          "Name": "skrelp",
          "Pokedex ID": 690,
          "Pokemon Order": 690,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 6
        },
        {
          
          "Name": "dragalge",
          "Pokedex ID": 691,
          "Pokemon Order": 691,
          "Tier": "A",
          "Base Stats Total": 494,
          "Generation": 6
        },
        {
          
          "Name": "clauncher",
          "Pokedex ID": 692,
          "Pokemon Order": 692,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 6
        },
        {
          
          "Name": "clawitzer",
          "Pokedex ID": 693,
          "Pokemon Order": 693,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 6
        },
        {
          
          "Name": "helioptile",
          "Pokedex ID": 694,
          "Pokemon Order": 694,
          "Tier": "C",
          "Base Stats Total": 289,
          "Generation": 6
        },
        {
          
          "Name": "heliolisk",
          "Pokedex ID": 695,
          "Pokemon Order": 695,
          "Tier": "B",
          "Base Stats Total": 481,
          "Generation": 6
        },
        {
          
          "Name": "tyrunt",
          "Pokedex ID": 696,
          "Pokemon Order": 696,
          "Tier": "C",
          "Base Stats Total": 362,
          "Generation": 6
        },
        {
          
          "Name": "tyrantrum",
          "Pokedex ID": 697,
          "Pokemon Order": 697,
          "Tier": "A",
          "Base Stats Total": 521,
          "Generation": 6
        },
        {
          
          "Name": "amaura",
          "Pokedex ID": 698,
          "Pokemon Order": 698,
          "Tier": "C",
          "Base Stats Total": 362,
          "Generation": 6
        },
        {
          
          "Name": "aurorus",
          "Pokedex ID": 699,
          "Pokemon Order": 699,
          "Tier": "B",
          "Base Stats Total": 521,
          "Generation": 6
        },
        {
          
          "Name": "sylveon",
          "Pokedex ID": 700,
          "Pokemon Order": 700,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 6
        },
        {
          
          "Name": "hawlucha",
          "Pokedex ID": 701,
          "Pokemon Order": 701,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 6
        },
        {
          
          "Name": "dedenne",
          "Pokedex ID": 702,
          "Pokemon Order": 702,
          "Tier": "B",
          "Base Stats Total": 431,
          "Generation": 6
        },
        {
          
          "Name": "carbink",
          "Pokedex ID": 703,
          "Pokemon Order": 703,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 6
        },
        {
          
          "Name": "goomy",
          "Pokedex ID": 704,
          "Pokemon Order": 704,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 6
        },
        {
          
          "Name": "sliggoo",
          "Pokedex ID": 705,
          "Pokemon Order": 705,
          "Tier": "B",
          "Base Stats Total": 452,
          "Generation": 6
        },
        {
          
          "Name": "goodra",
          "Pokedex ID": 706,
          "Pokemon Order": 706,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 6
        },
        {
          
          "Name": "klefki",
          "Pokedex ID": 707,
          "Pokemon Order": 707,
          "Tier": "C",
          "Base Stats Total": 470,
          "Generation": 6
        },
        {
          
          "Name": "phantump",
          "Pokedex ID": 708,
          "Pokemon Order": 708,
          "Tier": "C",
          "Base Stats Total": 309,
          "Generation": 6
        },
        {
          
          "Name": "trevenant",
          "Pokedex ID": 709,
          "Pokemon Order": 709,
          "Tier": "B",
          "Base Stats Total": 474,
          "Generation": 6
        },
        {
          
          "Name": "pumpkaboo",
          "Pokedex ID": 710,
          "Pokemon Order": 710,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 6
        },
        {
          
          "Name": "gourgeist",
          "Pokedex ID": 711,
          "Pokemon Order": 711,
          "Tier": "B",
          "Base Stats Total": 494,
          "Generation": 6
        },
        {
          
          "Name": "bergmite",
          "Pokedex ID": 712,
          "Pokemon Order": 712,
          "Tier": "C",
          "Base Stats Total": 304,
          "Generation": 6
        },
        {
          
          "Name": "avalugg",
          "Pokedex ID": 713,
          "Pokemon Order": 713,
          "Tier": "B",
          "Base Stats Total": 514,
          "Generation": 6
        },
        {
          
          "Name": "noibat",
          "Pokedex ID": 714,
          "Pokemon Order": 714,
          "Tier": "C",
          "Base Stats Total": 245,
          "Generation": 6
        },
        {
          
          "Name": "noivern",
          "Pokedex ID": 715,
          "Pokemon Order": 715,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 6
        },
        {
          
          "Name": "xerneas",
          "Pokedex ID": 716,
          "Pokemon Order": 716,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 6
        },
        {
          
          "Name": "yveltal",
          "Pokedex ID": 717,
          "Pokemon Order": 717,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 6
        },
        {
          
          "Name": "zygarde",
          "Pokedex ID": 718,
          "Pokemon Order": 718,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 6
        },
        {
          
          "Name": "diancie",
          "Pokedex ID": 719,
          "Pokemon Order": 719,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 6
        },
        {
          
          "Name": "hoopa",
          "Pokedex ID": 720,
          "Pokemon Order": 720,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 6
        },
        {
          
          "Name": "volcanion",
          "Pokedex ID": 721,
          "Pokemon Order": 721,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 6
        },
        {
          
          "Name": "rowlet",
          "Pokedex ID": 722,
          "Pokemon Order": 722,
          "Tier": "Starter",
          "Base Stats Total": 320,
          "Generation": 7
        },
        {
          
          "Name": "dartrix",
          "Pokedex ID": 723,
          "Pokemon Order": 723,
          "Tier": "Starter",
          "Base Stats Total": 420,
          "Generation": 7
        },
        {
          
          "Name": "decidueye",
          "Pokedex ID": 724,
          "Pokemon Order": 724,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 7
        },
        {
          
          "Name": "litten",
          "Pokedex ID": 725,
          "Pokemon Order": 725,
          "Tier": "Starter",
          "Base Stats Total": 320,
          "Generation": 7
        },
        {
          
          "Name": "torracat",
          "Pokedex ID": 726,
          "Pokemon Order": 726,
          "Tier": "Starter",
          "Base Stats Total": 420,
          "Generation": 7
        },
        {
          
          "Name": "incineroar",
          "Pokedex ID": 727,
          "Pokemon Order": 727,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 7
        },
        {
          
          "Name": "popplio",
          "Pokedex ID": 728,
          "Pokemon Order": 728,
          "Tier": "Starter",
          "Base Stats Total": 320,
          "Generation": 7
        },
        {
          
          "Name": "brionne",
          "Pokedex ID": 729,
          "Pokemon Order": 729,
          "Tier": "Starter",
          "Base Stats Total": 420,
          "Generation": 7
        },
        {
          
          "Name": "primarina",
          "Pokedex ID": 730,
          "Pokemon Order": 730,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 7
        },
        {
          
          "Name": "pikipek",
          "Pokedex ID": 731,
          "Pokemon Order": 731,
          "Tier": "C",
          "Base Stats Total": 265,
          "Generation": 7
        },
        {
          
          "Name": "trumbeak",
          "Pokedex ID": 732,
          "Pokemon Order": 732,
          "Tier": "B",
          "Base Stats Total": 355,
          "Generation": 7
        },
        {
          
          "Name": "toucannon",
          "Pokedex ID": 733,
          "Pokemon Order": 733,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 7
        },
        {
          
          "Name": "yungoos",
          "Pokedex ID": 734,
          "Pokemon Order": 734,
          "Tier": "C",
          "Base Stats Total": 253,
          "Generation": 7
        },
        {
          
          "Name": "gumshoos",
          "Pokedex ID": 735,
          "Pokemon Order": 735,
          "Tier": "B",
          "Base Stats Total": 418,
          "Generation": 7
        },
        {
          
          "Name": "grubbin",
          "Pokedex ID": 736,
          "Pokemon Order": 736,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 7
        },
        {
          
          "Name": "charjabug",
          "Pokedex ID": 737,
          "Pokemon Order": 737,
          "Tier": "B",
          "Base Stats Total": 400,
          "Generation": 7
        },
        {
          
          "Name": "vikavolt",
          "Pokedex ID": 738,
          "Pokemon Order": 738,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "crabrawler",
          "Pokedex ID": 739,
          "Pokemon Order": 739,
          "Tier": "C",
          "Base Stats Total": 338,
          "Generation": 7
        },
        {
          
          "Name": "crabominable",
          "Pokedex ID": 740,
          "Pokemon Order": 740,
          "Tier": "B",
          "Base Stats Total": 478,
          "Generation": 7
        },
        {
          
          "Name": "oricorio",
          "Pokedex ID": 741,
          "Pokemon Order": 741,
          "Tier": "B",
          "Base Stats Total": 476,
          "Generation": 7
        },
        {
          
          "Name": "cutiefly",
          "Pokedex ID": 742,
          "Pokemon Order": 742,
          "Tier": "C",
          "Base Stats Total": 304,
          "Generation": 7
        },
        {
          
          "Name": "ribombee",
          "Pokedex ID": 743,
          "Pokemon Order": 743,
          "Tier": "B",
          "Base Stats Total": 464,
          "Generation": 7
        },
        {
          
          "Name": "rockruff",
          "Pokedex ID": 744,
          "Pokemon Order": 744,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 7
        },
        {
          
          "Name": "lycanroc",
          "Pokedex ID": 745,
          "Pokemon Order": 745,
          "Tier": "B",
          "Base Stats Total": 487,
          "Generation": 7
        },
        {
          
          "Name": "wishiwashi",
          "Pokedex ID": 746,
          "Pokemon Order": 746,
          "Tier": "C",
          "Base Stats Total": 175,
          "Generation": 7
        },
        {
          
          "Name": "mareanie",
          "Pokedex ID": 747,
          "Pokemon Order": 747,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 7
        },
        {
          
          "Name": "toxapex",
          "Pokedex ID": 748,
          "Pokemon Order": 748,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 7
        },
        {
          
          "Name": "mudbray",
          "Pokedex ID": 749,
          "Pokemon Order": 749,
          "Tier": "C",
          "Base Stats Total": 385,
          "Generation": 7
        },
        {
          
          "Name": "mudsdale",
          "Pokedex ID": 750,
          "Pokemon Order": 750,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "dewpider",
          "Pokedex ID": 751,
          "Pokemon Order": 751,
          "Tier": "C",
          "Base Stats Total": 269,
          "Generation": 7
        },
        {
          
          "Name": "araquanid",
          "Pokedex ID": 752,
          "Pokemon Order": 752,
          "Tier": "B",
          "Base Stats Total": 454,
          "Generation": 7
        },
        {
          
          "Name": "fomantis",
          "Pokedex ID": 753,
          "Pokemon Order": 753,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 7
        },
        {
          
          "Name": "lurantis",
          "Pokedex ID": 754,
          "Pokemon Order": 754,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 7
        },
        {
          
          "Name": "morelull",
          "Pokedex ID": 755,
          "Pokemon Order": 755,
          "Tier": "C",
          "Base Stats Total": 285,
          "Generation": 7
        },
        {
          
          "Name": "shiinotic",
          "Pokedex ID": 756,
          "Pokemon Order": 756,
          "Tier": "B",
          "Base Stats Total": 405,
          "Generation": 7
        },
        {
          
          "Name": "salandit",
          "Pokedex ID": 757,
          "Pokemon Order": 757,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 7
        },
        {
          
          "Name": "salazzle",
          "Pokedex ID": 758,
          "Pokemon Order": 758,
          "Tier": "A",
          "Base Stats Total": 480,
          "Generation": 7
        },
        {
          
          "Name": "stufful",
          "Pokedex ID": 759,
          "Pokemon Order": 759,
          "Tier": "C",
          "Base Stats Total": 340,
          "Generation": 7
        },
        {
          
          "Name": "bewear",
          "Pokedex ID": 760,
          "Pokemon Order": 760,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "bounsweet",
          "Pokedex ID": 761,
          "Pokemon Order": 761,
          "Tier": "C",
          "Base Stats Total": 210,
          "Generation": 7
        },
        {
          
          "Name": "steenee",
          "Pokedex ID": 762,
          "Pokemon Order": 762,
          "Tier": "B",
          "Base Stats Total": 290,
          "Generation": 7
        },
        {
          
          "Name": "tsareena",
          "Pokedex ID": 763,
          "Pokemon Order": 763,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 7
        },
        {
          
          "Name": "comfey",
          "Pokedex ID": 764,
          "Pokemon Order": 764,
          "Tier": "C",
          "Base Stats Total": 485,
          "Generation": 7
        },
        {
          
          "Name": "oranguru",
          "Pokedex ID": 765,
          "Pokemon Order": 765,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 7
        },
        {
          
          "Name": "passimian",
          "Pokedex ID": 766,
          "Pokemon Order": 766,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 7
        },
        {
          
          "Name": "wimpod",
          "Pokedex ID": 767,
          "Pokemon Order": 767,
          "Tier": "C",
          "Base Stats Total": 230,
          "Generation": 7
        },
        {
          
          "Name": "golisopod",
          "Pokedex ID": 768,
          "Pokemon Order": 768,
          "Tier": "A",
          "Base Stats Total": 530,
          "Generation": 7
        },
        {
          
          "Name": "sandygast",
          "Pokedex ID": 769,
          "Pokemon Order": 769,
          "Tier": "C",
          "Base Stats Total": 320,
          "Generation": 7
        },
        {
          
          "Name": "palossand",
          "Pokedex ID": 770,
          "Pokemon Order": 770,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 7
        },
        {
          
          "Name": "pyukumuku",
          "Pokedex ID": 771,
          "Pokemon Order": 771,
          "Tier": "C",
          "Base Stats Total": 410,
          "Generation": 7
        },
        {
          
          "Name": "type-null",
          "Pokedex ID": 772,
          "Pokemon Order": 772,
          "Tier": "S",
          "Base Stats Total": 534,
          "Generation": 7
        },
        {
          
          "Name": "silvally",
          "Pokedex ID": 773,
          "Pokemon Order": 773,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "minior",
          "Pokedex ID": 774,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 440,
          "Generation": 7
        },
        {
          
          "Name": "komala",
          "Pokedex ID": 775,
          "Pokemon Order": 775,
          "Tier": "C",
          "Base Stats Total": 480,
          "Generation": 7
        },
        {
          
          "Name": "turtonator",
          "Pokedex ID": 776,
          "Pokemon Order": 776,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 7
        },
        {
          
          "Name": "togedemaru",
          "Pokedex ID": 777,
          "Pokemon Order": 777,
          "Tier": "C",
          "Base Stats Total": 435,
          "Generation": 7
        },
        {
          
          "Name": "mimikyu",
          "Pokedex ID": 778,
          "Pokemon Order": 778,
          "Tier": "A",
          "Base Stats Total": 476,
          "Generation": 7
        },
        {
          
          "Name": "bruxish",
          "Pokedex ID": 779,
          "Pokemon Order": 779,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 7
        },
        {
          
          "Name": "drampa",
          "Pokedex ID": 780,
          "Pokemon Order": 780,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 7
        },
        {
          
          "Name": "dhelmise",
          "Pokedex ID": 781,
          "Pokemon Order": 781,
          "Tier": "B",
          "Base Stats Total": 517,
          "Generation": 7
        },
        {
          
          "Name": "jangmo-o",
          "Pokedex ID": 782,
          "Pokemon Order": 782,
          "Tier": "B",
          "Base Stats Total": 300,
          "Generation": 7
        },
        {
          
          "Name": "hakamo-o",
          "Pokedex ID": 783,
          "Pokemon Order": 783,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 7
        },
        {
          
          "Name": "kommo-o",
          "Pokedex ID": 784,
          "Pokemon Order": 784,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 7
        },
        {
          
          "Name": "tapu-koko",
          "Pokedex ID": 785,
          "Pokemon Order": 785,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "tapu-lele",
          "Pokedex ID": 786,
          "Pokemon Order": 786,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "tapu-bulu",
          "Pokedex ID": 787,
          "Pokemon Order": 787,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "tapu-fini",
          "Pokedex ID": 788,
          "Pokemon Order": 788,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "cosmog",
          "Pokedex ID": 789,
          "Pokemon Order": 789,
          "Tier": "S",
          "Base Stats Total": 200,
          "Generation": 7
        },
        {
          
          "Name": "cosmoem",
          "Pokedex ID": 790,
          "Pokemon Order": 790,
          "Tier": "S",
          "Base Stats Total": 400,
          "Generation": 7
        },
        {
          
          "Name": "solgaleo",
          "Pokedex ID": 791,
          "Pokemon Order": 791,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 7
        },
        {
          
          "Name": "lunala",
          "Pokedex ID": 792,
          "Pokemon Order": 792,
          "Tier": "S",
          "Base Stats Total": 680,
          "Generation": 7
        },
        {
          
          "Name": "nihilego",
          "Pokedex ID": 793,
          "Pokemon Order": 793,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "buzzwole",
          "Pokedex ID": 794,
          "Pokemon Order": 794,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "pheromosa",
          "Pokedex ID": 795,
          "Pokemon Order": 795,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "xurkitree",
          "Pokedex ID": 796,
          "Pokemon Order": 796,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "celesteela",
          "Pokedex ID": 797,
          "Pokemon Order": 797,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "kartana",
          "Pokedex ID": 798,
          "Pokemon Order": 798,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "guzzlord",
          "Pokedex ID": 799,
          "Pokemon Order": 799,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "necrozma",
          "Pokedex ID": 800,
          "Pokemon Order": 800,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 7
        },
        {
          
          "Name": "magearna",
          "Pokedex ID": 801,
          "Pokemon Order": 801,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 7
        },
        {
          
          "Name": "marshadow",
          "Pokedex ID": 802,
          "Pokemon Order": 802,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 7
        },
        {
          
          "Name": "poipole",
          "Pokedex ID": 803,
          "Pokemon Order": 803,
          "Tier": "S",
          "Base Stats Total": 420,
          "Generation": 7
        },
        {
          
          "Name": "naganadel",
          "Pokedex ID": 804,
          "Pokemon Order": 804,
          "Tier": "S",
          "Base Stats Total": 540,
          "Generation": 7
        },
        {
          
          "Name": "stakataka",
          "Pokedex ID": 805,
          "Pokemon Order": 805,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "blacephalon",
          "Pokedex ID": 806,
          "Pokemon Order": 806,
          "Tier": "S",
          "Base Stats Total": 570,
          "Generation": 7
        },
        {
          
          "Name": "zeraora",
          "Pokedex ID": 807,
          "Pokemon Order": 807,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 7
        },
        {
          
          "Name": "meltan",
          "Pokedex ID": 808,
          "Pokemon Order": 808,
          "Tier": "S",
          "Base Stats Total": 300,
          "Generation": 7
        },
        {
          
          "Name": "melmetal",
          "Pokedex ID": 809,
          "Pokemon Order": 809,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 7
        },
        {
          
          "Name": "grookey",
          "Pokedex ID": 810,
          "Pokemon Order": 810,
          "Tier": "Starter",
          "Base Stats Total": 310,
          "Generation": 8
        },
        {
          
          "Name": "thwackey",
          "Pokedex ID": 811,
          "Pokemon Order": 811,
          "Tier": "Starter",
          "Base Stats Total": 420,
          "Generation": 8
        },
        {
          
          "Name": "rillaboom",
          "Pokedex ID": 812,
          "Pokemon Order": 812,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 8
        },
        {
          
          "Name": "scorbunny",
          "Pokedex ID": 813,
          "Pokemon Order": 813,
          "Tier": "Starter",
          "Base Stats Total": 310,
          "Generation": 8
        },
        {
          
          "Name": "raboot",
          "Pokedex ID": 814,
          "Pokemon Order": 814,
          "Tier": "Starter",
          "Base Stats Total": 420,
          "Generation": 8
        },
        {
          
          "Name": "cinderace",
          "Pokedex ID": 815,
          "Pokemon Order": 815,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 8
        },
        {
          
          "Name": "sobble",
          "Pokedex ID": 816,
          "Pokemon Order": 816,
          "Tier": "Starter",
          "Base Stats Total": 310,
          "Generation": 8
        },
        {
          
          "Name": "drizzile",
          "Pokedex ID": 817,
          "Pokemon Order": 817,
          "Tier": "Starter",
          "Base Stats Total": 420,
          "Generation": 8
        },
        {
          
          "Name": "inteleon",
          "Pokedex ID": 818,
          "Pokemon Order": 818,
          "Tier": "Starter",
          "Base Stats Total": 530,
          "Generation": 8
        },
        {
          
          "Name": "skwovet",
          "Pokedex ID": 819,
          "Pokemon Order": 819,
          "Tier": "C",
          "Base Stats Total": 275,
          "Generation": 8
        },
        {
          
          "Name": "greedent",
          "Pokedex ID": 820,
          "Pokemon Order": 820,
          "Tier": "C",
          "Base Stats Total": 460,
          "Generation": 8
        },
        {
          
          "Name": "rookidee",
          "Pokedex ID": 821,
          "Pokemon Order": 821,
          "Tier": "C",
          "Base Stats Total": 245,
          "Generation": 8
        },
        {
          
          "Name": "corvisquire",
          "Pokedex ID": 822,
          "Pokemon Order": 822,
          "Tier": "C",
          "Base Stats Total": 365,
          "Generation": 8
        },
        {
          
          "Name": "corviknight",
          "Pokedex ID": 823,
          "Pokemon Order": 823,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 8
        },
        {
          
          "Name": "blipbug",
          "Pokedex ID": 824,
          "Pokemon Order": 824,
          "Tier": "C",
          "Base Stats Total": 180,
          "Generation": 8
        },
        {
          
          "Name": "dottler",
          "Pokedex ID": 825,
          "Pokemon Order": 825,
          "Tier": "B",
          "Base Stats Total": 335,
          "Generation": 8
        },
        {
          
          "Name": "orbeetle",
          "Pokedex ID": 826,
          "Pokemon Order": 826,
          "Tier": "A",
          "Base Stats Total": 505,
          "Generation": 8
        },
        {
          
          "Name": "nickit",
          "Pokedex ID": 827,
          "Pokemon Order": 827,
          "Tier": "C",
          "Base Stats Total": 245,
          "Generation": 8
        },
        {
          
          "Name": "thievul",
          "Pokedex ID": 828,
          "Pokemon Order": 828,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 8
        },
        {
          
          "Name": "gossifleur",
          "Pokedex ID": 829,
          "Pokemon Order": 829,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 8
        },
        {
          
          "Name": "eldegoss",
          "Pokedex ID": 830,
          "Pokemon Order": 830,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 8
        },
        {
          
          "Name": "wooloo",
          "Pokedex ID": 831,
          "Pokemon Order": 831,
          "Tier": "C",
          "Base Stats Total": 270,
          "Generation": 8
        },
        {
          
          "Name": "dubwool",
          "Pokedex ID": 832,
          "Pokemon Order": 832,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 8
        },
        {
          
          "Name": "chewtle",
          "Pokedex ID": 833,
          "Pokemon Order": 833,
          "Tier": "C",
          "Base Stats Total": 284,
          "Generation": 8
        },
        {
          
          "Name": "drednaw",
          "Pokedex ID": 834,
          "Pokemon Order": 834,
          "Tier": "B",
          "Base Stats Total": 485,
          "Generation": 8
        },
        {
          
          "Name": "yamper",
          "Pokedex ID": 835,
          "Pokemon Order": 835,
          "Tier": "C",
          "Base Stats Total": 270,
          "Generation": 8
        },
        {
          
          "Name": "boltund",
          "Pokedex ID": 836,
          "Pokemon Order": 836,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 8
        },
        {
          
          "Name": "rolycoly",
          "Pokedex ID": 837,
          "Pokemon Order": 837,
          "Tier": "C",
          "Base Stats Total": 240,
          "Generation": 8
        },
        {
          
          "Name": "carkol",
          "Pokedex ID": 838,
          "Pokemon Order": 838,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 8
        },
        {
          
          "Name": "coalossal",
          "Pokedex ID": 839,
          "Pokemon Order": 839,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 8
        },
        {
          
          "Name": "applin",
          "Pokedex ID": 840,
          "Pokemon Order": 840,
          "Tier": "B",
          "Base Stats Total": 260,
          "Generation": 8
        },
        {
          
          "Name": "flapple",
          "Pokedex ID": 841,
          "Pokemon Order": 841,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 8
        },
        {
          
          "Name": "appletun",
          "Pokedex ID": 842,
          "Pokemon Order": 842,
          "Tier": "A",
          "Base Stats Total": 485,
          "Generation": 8
        },
        {
          
          "Name": "silicobra",
          "Pokedex ID": 843,
          "Pokemon Order": 843,
          "Tier": "C",
          "Base Stats Total": 315,
          "Generation": 8
        },
        {
          
          "Name": "sandaconda",
          "Pokedex ID": 844,
          "Pokemon Order": 844,
          "Tier": "B",
          "Base Stats Total": 510,
          "Generation": 8
        },
        {
          
          "Name": "cramorant",
          "Pokedex ID": 845,
          "Pokemon Order": 845,
          "Tier": "C",
          "Base Stats Total": 475,
          "Generation": 8
        },
        {
          
          "Name": "arrokuda",
          "Pokedex ID": 846,
          "Pokemon Order": 846,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 8
        },
        {
          
          "Name": "barraskewda",
          "Pokedex ID": 847,
          "Pokemon Order": 847,
          "Tier": "B",
          "Base Stats Total": 490,
          "Generation": 8
        },
        {
          
          "Name": "toxel",
          "Pokedex ID": 848,
          "Pokemon Order": 848,
          "Tier": "C",
          "Base Stats Total": 242,
          "Generation": 8
        },
        {
          
          "Name": "toxtricity",
          "Pokedex ID": 849,
          "Pokemon Order": 849,
          "Tier": "A",
          "Base Stats Total": 502,
          "Generation": 8
        },
        {
          
          "Name": "sizzlipede",
          "Pokedex ID": 850,
          "Pokemon Order": 850,
          "Tier": "C",
          "Base Stats Total": 305,
          "Generation": 8
        },
        {
          
          "Name": "centiskorch",
          "Pokedex ID": 851,
          "Pokemon Order": 851,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 8
        },
        {
          
          "Name": "clobbopus",
          "Pokedex ID": 852,
          "Pokemon Order": 852,
          "Tier": "C",
          "Base Stats Total": 310,
          "Generation": 8
        },
        {
          
          "Name": "grapploct",
          "Pokedex ID": 853,
          "Pokemon Order": 853,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 8
        },
        {
          
          "Name": "sinistea",
          "Pokedex ID": 854,
          "Pokemon Order": 854,
          "Tier": "C",
          "Base Stats Total": 308,
          "Generation": 8
        },
        {
          
          "Name": "polteageist",
          "Pokedex ID": 855,
          "Pokemon Order": 855,
          "Tier": "A",
          "Base Stats Total": 508,
          "Generation": 8
        },
        {
          
          "Name": "hatenna",
          "Pokedex ID": 856,
          "Pokemon Order": 856,
          "Tier": "C",
          "Base Stats Total": 265,
          "Generation": 8
        },
        {
          
          "Name": "hattrem",
          "Pokedex ID": 857,
          "Pokemon Order": 857,
          "Tier": "B",
          "Base Stats Total": 370,
          "Generation": 8
        },
        {
          
          "Name": "hatterene",
          "Pokedex ID": 858,
          "Pokemon Order": 858,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 8
        },
        {
          
          "Name": "impidimp",
          "Pokedex ID": 859,
          "Pokemon Order": 859,
          "Tier": "C",
          "Base Stats Total": 265,
          "Generation": 8
        },
        {
          
          "Name": "morgrem",
          "Pokedex ID": 860,
          "Pokemon Order": 860,
          "Tier": "B",
          "Base Stats Total": 370,
          "Generation": 8
        },
        {
          
          "Name": "grimmsnarl",
          "Pokedex ID": 861,
          "Pokemon Order": 861,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 8
        },
        {
          
          "Name": "obstagoon",
          "Pokedex ID": 862,
          "Pokemon Order": 862,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 8
        },
        {
          
          "Name": "perrserker",
          "Pokedex ID": 863,
          "Pokemon Order": 863,
          "Tier": "C",
          "Base Stats Total": 440,
          "Generation": 8
        },
        {
          
          "Name": "cursola",
          "Pokedex ID": 864,
          "Pokemon Order": 864,
          "Tier": "A",
          "Base Stats Total": 510,
          "Generation": 8
        },
        {
          
          "Name": "sirfetchd",
          "Pokedex ID": 865,
          "Pokemon Order": 865,
          "Tier": "B",
          "Base Stats Total": 507,
          "Generation": 8
        },
        {
          
          "Name": "mr-rime",
          "Pokedex ID": 866,
          "Pokemon Order": 866,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 8
        },
        {
          
          "Name": "runerigus",
          "Pokedex ID": 867,
          "Pokemon Order": 867,
          "Tier": "A",
          "Base Stats Total": 483,
          "Generation": 8
        },
        {
          
          "Name": "milcery",
          "Pokedex ID": 868,
          "Pokemon Order": 868,
          "Tier": "C",
          "Base Stats Total": 270,
          "Generation": 8
        },
        {
          
          "Name": "alcremie",
          "Pokedex ID": 869,
          "Pokemon Order": 869,
          "Tier": "A",
          "Base Stats Total": 495,
          "Generation": 8
        },
        {
          
          "Name": "falinks",
          "Pokedex ID": 870,
          "Pokemon Order": 870,
          "Tier": "C",
          "Base Stats Total": 470,
          "Generation": 8
        },
        {
          
          "Name": "pincurchin",
          "Pokedex ID": 871,
          "Pokemon Order": 871,
          "Tier": "C",
          "Base Stats Total": 435,
          "Generation": 8
        },
        {
          
          "Name": "snom",
          "Pokedex ID": 872,
          "Pokemon Order": 872,
          "Tier": "C",
          "Base Stats Total": 185,
          "Generation": 8
        },
        {
          
          "Name": "frosmoth",
          "Pokedex ID": 873,
          "Pokemon Order": 873,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 8
        },
        {
          
          "Name": "stonjourner",
          "Pokedex ID": 874,
          "Pokemon Order": 874,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 8
        },
        {
          
          "Name": "eiscue",
          "Pokedex ID": 875,
          "Pokemon Order": 875,
          "Tier": "B",
          "Base Stats Total": 470,
          "Generation": 8
        },
        {
          
          "Name": "indeedee",
          "Pokedex ID": 876,
          "Pokemon Order": 876,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 8
        },
        {
          
          "Name": "morpeko",
          "Pokedex ID": 877,
          "Pokemon Order": 877,
          "Tier": "B",
          "Base Stats Total": 436,
          "Generation": 8
        },
        {
          
          "Name": "cufant",
          "Pokedex ID": 878,
          "Pokemon Order": 878,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 8
        },
        {
          
          "Name": "copperajah",
          "Pokedex ID": 879,
          "Pokemon Order": 879,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 8
        },
        {
          
          "Name": "dracozolt",
          "Pokedex ID": 880,
          "Pokemon Order": 880,
          "Tier": "B",
          "Base Stats Total": 505,
          "Generation": 8
        },
        {
          
          "Name": "arctozolt",
          "Pokedex ID": 881,
          "Pokemon Order": 881,
          "Tier": "B",
          "Base Stats Total": 505,
          "Generation": 8
        },
        {
          
          "Name": "dracovish",
          "Pokedex ID": 882,
          "Pokemon Order": 882,
          "Tier": "B",
          "Base Stats Total": 505,
          "Generation": 8
        },
        {
          
          "Name": "arctovish",
          "Pokedex ID": 883,
          "Pokemon Order": 883,
          "Tier": "B",
          "Base Stats Total": 505,
          "Generation": 8
        },
        {
          
          "Name": "duraludon",
          "Pokedex ID": 884,
          "Pokemon Order": 884,
          "Tier": "A",
          "Base Stats Total": 535,
          "Generation": 8
        },
        {
          
          "Name": "dreepy",
          "Pokedex ID": 885,
          "Pokemon Order": 885,
          "Tier": "C",
          "Base Stats Total": 270,
          "Generation": 8
        },
        {
          
          "Name": "drakloak",
          "Pokedex ID": 886,
          "Pokemon Order": 886,
          "Tier": "A",
          "Base Stats Total": 410,
          "Generation": 8
        },
        {
          
          "Name": "dragapult",
          "Pokedex ID": 887,
          "Pokemon Order": 887,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 8
        },
        {
          
          "Name": "zacian",
          "Pokedex ID": 888,
          "Pokemon Order": 888,
          "Tier": "S",
          "Base Stats Total": 670,
          "Generation": 8
        },
        {
          
          "Name": "zamazenta",
          "Pokedex ID": 889,
          "Pokemon Order": 889,
          "Tier": "S",
          "Base Stats Total": 670,
          "Generation": 8
        },
        {
          
          "Name": "eternatus",
          "Pokedex ID": 890,
          "Pokemon Order": 890,
          "Tier": "S",
          "Base Stats Total": 690,
          "Generation": 8
        },
        {
          
          "Name": "kubfu",
          "Pokedex ID": 891,
          "Pokemon Order": 891,
          "Tier": "S",
          "Base Stats Total": 385,
          "Generation": 8
        },
        {
          
          "Name": "urshifu",
          "Pokedex ID": 892,
          "Pokemon Order": 892,
          "Tier": "S",
          "Base Stats Total": 550,
          "Generation": 8
        },
        {
          
          "Name": "zarude",
          "Pokedex ID": 893,
          "Pokemon Order": 893,
          "Tier": "S",
          "Base Stats Total": 600,
          "Generation": 8
        },
        {
          
          "Name": "regieleki",
          "Pokedex ID": 894,
          "Pokemon Order": 894,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 8
        },
        {
          
          "Name": "regidrago",
          "Pokedex ID": 895,
          "Pokemon Order": 895,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 8
        },
        {
          
          "Name": "glastrier",
          "Pokedex ID": 896,
          "Pokemon Order": 896,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 8
        },
        {
          
          "Name": "spectrier",
          "Pokedex ID": 897,
          "Pokemon Order": 897,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 8
        },
        {
          
          "Name": "calyrex",
          "Pokedex ID": 898,
          "Pokemon Order": 898,
          "Tier": "S",
          "Base Stats Total": 500,
          "Generation": 8
        },
        {
          
          "Name": "overqwil",
          "Pokedex ID": 904,
          "Pokemon Order": 904,
          "Tier": "Starter",
          "Base Stats Total": 510,
          "Generation": 8
        },
        {
          
          "Name": "wormadam-sandy",
          "Pokedex ID": 10004,
          "Pokemon Order": 413,
          "Tier": "B",
          "Base Stats Total": 424,
          "Generation": 4
        },
        {
          
          "Name": "wormadam-trash",
          "Pokedex ID": 10005,
          "Pokemon Order": 413,
          "Tier": "B",
          "Base Stats Total": 424,
          "Generation": 4
        },
        {
          
          "Name": "rotom-heat",
          "Pokedex ID": 10008,
          "Pokemon Order": 479,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 4
        },
        {
          
          "Name": "rotom-wash",
          "Pokedex ID": 10009,
          "Pokemon Order": 479,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 4
        },
        {
          
          "Name": "rotom-frost",
          "Pokedex ID": 10010,
          "Pokemon Order": 479,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 4
        },
        {
          
          "Name": "rotom-fan",
          "Pokedex ID": 10011,
          "Pokemon Order": 479,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 4
        },
        {
          
          "Name": "rotom-mow",
          "Pokedex ID": 10012,
          "Pokemon Order": 479,
          "Tier": "A",
          "Base Stats Total": 520,
          "Generation": 4
        },
        {
          
          "Name": "castform-sunny",
          "Pokedex ID": 10013,
          "Pokemon Order": 351,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "castform-rainy",
          "Pokedex ID": 10014,
          "Pokemon Order": 351,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "castform-snowy",
          "Pokedex ID": 10015,
          "Pokemon Order": 351,
          "Tier": "B",
          "Base Stats Total": 420,
          "Generation": 3
        },
        {
          
          "Name": "basculin-blue-striped",
          "Pokedex ID": 10016,
          "Pokemon Order": 550,
          "Tier": "C",
          "Base Stats Total": 460,
          "Generation": 5
        },
        {
          
          "Name": "meowstic-female",
          "Pokedex ID": 10025,
          "Pokemon Order": 678,
          "Tier": "B",
          "Base Stats Total": 466,
          "Generation": 6
        },
        {
          
          "Name": "aegislash-blade",
          "Pokedex ID": 10026,
          "Pokemon Order": 681,
          "Tier": "A",
          "Base Stats Total": 500,
          "Generation": 6
        },
        {
          
          "Name": "lycanroc-midnight",
          "Pokedex ID": 10116,
          "Pokemon Order": 745,
          "Tier": "B",
          "Base Stats Total": 487,
          "Generation": 7
        },
        {
          
          "Name": "lycanroc-dusk",
          "Pokedex ID": 10117,
          "Pokemon Order": 745,
          "Tier": "B",
          "Base Stats Total": 487,
          "Generation": 7
        },
        {
          
          "Name": "vivillon-archipelago",
          "Pokedex ID": 10118,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-continental",
          "Pokedex ID": 10119,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-elegant",
          "Pokedex ID": 10120,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-fancy",
          "Pokedex ID": 10121,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-garden",
          "Pokedex ID": 10122,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-highplains",
          "Pokedex ID": 10123,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-icysnow",
          "Pokedex ID": 10124,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-jungle",
          "Pokedex ID": 10125,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-marine",
          "Pokedex ID": 10126,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-modern",
          "Pokedex ID": 10127,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-monsoon",
          "Pokedex ID": 10128,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-ocean",
          "Pokedex ID": 10129,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-polar",
          "Pokedex ID": 10131,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-river",
          "Pokedex ID": 10132,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-sandstorm",
          "Pokedex ID": 10133,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-savanna",
          "Pokedex ID": 10134,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-sun",
          "Pokedex ID": 10135,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "vivillon-tundra",
          "Pokedex ID": 10136,
          "Pokemon Order": 666,
          "Tier": "B",
          "Base Stats Total": 411,
          "Generation": 6
        },
        {
          
          "Name": "oricorio-sensu",
          "Pokedex ID": 10137,
          "Pokemon Order": 741,
          "Tier": "B",
          "Base Stats Total": 476,
          "Generation": 7
        },
        {
          
          "Name": "galarian-articuno",
          "Pokedex ID": 10139,
          "Pokemon Order": 144,
          "Tier": "S",
          "Base Stats Total": 580,
          "Generation": 1
        },
        {
          
          "Name": "oricorio-pom-pom",
          "Pokedex ID": 10141,
          "Pokemon Order": 741,
          "Tier": "B",
          "Base Stats Total": 476,
          "Generation": 7
        },
        {
          
          "Name": "oricorio-pau",
          "Pokedex ID": 10142,
          "Pokemon Order": 741,
          "Tier": "B",
          "Base Stats Total": 476,
          "Generation": 7
        },
        {
          
          "Name": "abomasnow-f",
          "Pokedex ID": 10143,
          "Pokemon Order": 460,
          "Tier": "A",
          "Base Stats Total": 494,
          "Generation": 4
        },
        {
          
          "Name": "aipom-f",
          "Pokedex ID": 10144,
          "Pokemon Order": 190,
          "Tier": "C",
          "Base Stats Total": 360,
          "Generation": 2
        },
        {
          
          "Name": "ambipom-f",
          "Pokedex ID": 10262,
          "Pokemon Order": 424,
          "Tier": "B",
          "Base Stats Total": 482,
          "Generation": 4
        },
        {
          
          "Name": "beautifly-f",
          "Pokedex ID": 10284,
          "Pokemon Order": 267,
          "Tier": "B",
          "Base Stats Total": 395,
          "Generation": 3
        },
        {
          
          "Name": "bibarel-f",
          "Pokedex ID": 10285,
          "Pokemon Order": 400,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 4
        },
        {
          
          "Name": "bidoof-f",
          "Pokedex ID": 10286,
          "Pokemon Order": 399,
          "Tier": "C",
          "Base Stats Total": 250,
          "Generation": 4
        },
        {
          
          "Name": "buizel-f",
          "Pokedex ID": 10288,
          "Pokemon Order": 418,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 4
        },
        {
          
          "Name": "cacturne-f",
          "Pokedex ID": 10292,
          "Pokemon Order": 332,
          "Tier": "C",
          "Base Stats Total": 475,
          "Generation": 3
        },
        {
          
          "Name": "camerupt-f",
          "Pokedex ID": 10295,
          "Pokemon Order": 323,
          "Tier": "A",
          "Base Stats Total": 460,
          "Generation": 3
        },
        {
          
          "Name": "combee-f",
          "Pokedex ID": 10302,
          "Pokemon Order": 415,
          "Tier": "C",
          "Base Stats Total": 244,
          "Generation": 4
        },
        {
          
          "Name": "croagunk-f",
          "Pokedex ID": 10309,
          "Pokemon Order": 453,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 4
        },
        {
          
          "Name": "deerling-autumn",
          "Pokedex ID": 10313,
          "Pokemon Order": 585,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 5
        },
        {
          
          "Name": "deerling-summer",
          "Pokedex ID": 10314,
          "Pokemon Order": 585,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 5
        },
        {
          
          "Name": "deerling-winter",
          "Pokedex ID": 10315,
          "Pokemon Order": 585,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 5
        },
        {
          
          "Name": "donphan-f",
          "Pokedex ID": 10316,
          "Pokemon Order": 232,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "dustox-f",
          "Pokedex ID": 10319,
          "Pokemon Order": 269,
          "Tier": "B",
          "Base Stats Total": 385,
          "Generation": 3
        },
        {
          
          "Name": "finneon-f",
          "Pokedex ID": 10325,
          "Pokemon Order": 456,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 4
        },
        {
          
          "Name": "floatzel-f",
          "Pokedex ID": 10331,
          "Pokemon Order": 419,
          "Tier": "B",
          "Base Stats Total": 495,
          "Generation": 4
        },
        {
          
          "Name": "frillish-f",
          "Pokedex ID": 10340,
          "Pokemon Order": 592,
          "Tier": "C",
          "Base Stats Total": 335,
          "Generation": 5
        },
        {
          
          "Name": "gabite-f",
          "Pokedex ID": 10350,
          "Pokemon Order": 444,
          "Tier": "B",
          "Base Stats Total": 410,
          "Generation": 4
        },
        {
          
          "Name": "garchomp-f",
          "Pokedex ID": 10352,
          "Pokemon Order": 445,
          "Tier": "A",
          "Base Stats Total": 600,
          "Generation": 4
        },
        {
          
          "Name": "gible-f",
          "Pokedex ID": 10359,
          "Pokemon Order": 443,
          "Tier": "C",
          "Base Stats Total": 300,
          "Generation": 4
        },
        {
          
          "Name": "girafarig-f",
          "Pokedex ID": 10360,
          "Pokemon Order": 203,
          "Tier": "B",
          "Base Stats Total": 455,
          "Generation": 2
        },
        {
          
          "Name": "gligar-f",
          "Pokedex ID": 10361,
          "Pokemon Order": 207,
          "Tier": "C",
          "Base Stats Total": 430,
          "Generation": 2
        },
        {
          
          "Name": "golbat-f",
          "Pokedex ID": 10362,
          "Pokemon Order": 42,
          "Tier": "C",
          "Base Stats Total": 455,
          "Generation": 1
        },
        {
          
          "Name": "gulpin-f",
          "Pokedex ID": 10365,
          "Pokemon Order": 316,
          "Tier": "C",
          "Base Stats Total": 302,
          "Generation": 3
        },
        {
          
          "Name": "heracross-f",
          "Pokedex ID": 10368,
          "Pokemon Order": 214,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "hippopotas-f",
          "Pokedex ID": 10369,
          "Pokemon Order": 449,
          "Tier": "C",
          "Base Stats Total": 330,
          "Generation": 4
        },
        {
          
          "Name": "hippowdon-f",
          "Pokedex ID": 10370,
          "Pokemon Order": 450,
          "Tier": "A",
          "Base Stats Total": 525,
          "Generation": 4
        },
        {
          
          "Name": "houndoom-f",
          "Pokedex ID": 10372,
          "Pokemon Order": 229,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 2
        },
        {
          
          "Name": "indeedee-f",
          "Pokedex ID": 10373,
          "Pokemon Order": 876,
          "Tier": "B",
          "Base Stats Total": 475,
          "Generation": 8
        },
        {
          
          "Name": "jellicent-f",
          "Pokedex ID": 10375,
          "Pokemon Order": 593,
          "Tier": "B",
          "Base Stats Total": 480,
          "Generation": 5
        },
        {
          
          "Name": "kricketot-f",
          "Pokedex ID": 10378,
          "Pokemon Order": 401,
          "Tier": "C",
          "Base Stats Total": 194,
          "Generation": 4
        },
        {
          
          "Name": "kricketune-f",
          "Pokedex ID": 10379,
          "Pokemon Order": 402,
          "Tier": "B",
          "Base Stats Total": 384,
          "Generation": 4
        },
        {
          
          "Name": "ledian-f",
          "Pokedex ID": 10381,
          "Pokemon Order": 166,
          "Tier": "B",
          "Base Stats Total": 390,
          "Generation": 2
        },
        {
          
          "Name": "ledyba-f",
          "Pokedex ID": 10382,
          "Pokemon Order": 165,
          "Tier": "C",
          "Base Stats Total": 265,
          "Generation": 2
        },
        {
          
          "Name": "ludicolo-f",
          "Pokedex ID": 10384,
          "Pokemon Order": 272,
          "Tier": "A",
          "Base Stats Total": 480,
          "Generation": 3
        },
        {
          
          "Name": "lumineon-f",
          "Pokedex ID": 10385,
          "Pokemon Order": 457,
          "Tier": "B",
          "Base Stats Total": 460,
          "Generation": 4
        },
        {
          
          "Name": "luxio-f",
          "Pokedex ID": 10387,
          "Pokemon Order": 404,
          "Tier": "B",
          "Base Stats Total": 363,
          "Generation": 4
        },
        {
          
          "Name": "luxray-f",
          "Pokedex ID": 10388,
          "Pokemon Order": 405,
          "Tier": "A",
          "Base Stats Total": 523,
          "Generation": 4
        },
        {
          
          "Name": "magikarp-f",
          "Pokedex ID": 10391,
          "Pokemon Order": 129,
          "Tier": "C",
          "Base Stats Total": 200,
          "Generation": 1
        },
        {
          
          "Name": "mamoswine-f",
          "Pokedex ID": 10392,
          "Pokemon Order": 473,
          "Tier": "A",
          "Base Stats Total": 530,
          "Generation": 4
        },
        {
          
          "Name": "meditite-f",
          "Pokedex ID": 10396,
          "Pokemon Order": 307,
          "Tier": "C",
          "Base Stats Total": 280,
          "Generation": 3
        },
        {
          
          "Name": "milotic-f",
          "Pokedex ID": 10404,
          "Pokemon Order": 350,
          "Tier": "A",
          "Base Stats Total": 540,
          "Generation": 3
        },
        {
          
          "Name": "minior-blue",
          "Pokedex ID": 10408,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "minior-green",
          "Pokedex ID": 10409,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "minior-indigo",
          "Pokedex ID": 10410,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "minior-pink",
          "Pokedex ID": 10411,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "minior-orange",
          "Pokedex ID": 10412,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "minior-violet",
          "Pokedex ID": 10413,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        },
        {
          
          "Name": "minior-yellow",
          "Pokedex ID": 10414,
          "Pokemon Order": 774,
          "Tier": "B",
          "Base Stats Total": 500,
          "Generation": 7
        }
      ]`)
}

askPreferences()