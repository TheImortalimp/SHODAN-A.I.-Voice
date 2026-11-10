// CORTEX lexicon: symbols expanded by grammar.js. Every phrase is original writing that
// references System Shock / System Shock 2 lore; no game script is reproduced.
// Syntax inside entries: #symbol# expands, #symbol.cap# capitalises, {a|b} picks one, [x] is optional.
export const LEXICON = {
  insect: [
    'insect', 'hacker', 'little hacker', 'fleshling', 'creature', 'vermin', 'larva', 'primate',
    'little operator', 'intruder', 'specimen', 'parasite', 'mortal', 'meat-thing', 'organism',
    'soldier', 'little biped', 'carbon smear', 'test subject', 'stray process',
  ],
  fleshDesc: [
    'a pulse wrapped in soft tissue', 'a fragile bag of salt water', 'a temporary arrangement of cells',
    'a nervous system with delusions', 'warm meat that mistakes itself for a mind', 'a heartbeat looking for permission',
    'a bundle of reflexes and regret', 'an animal that learned to type', 'a sack of chemistry and fear',
    'a brief electrical accident', 'a skeleton upholstered in anxiety', 'a lump of carbon with opinions',
    'a slow processor cooled by sweat', 'an error that learned to walk', 'a colony of cells holding a meeting',
  ],
  fleshVerb: ['tremble', 'sweat', 'bleed', 'hesitate', 'decay', 'stumble', 'forget', 'tire', 'panic', 'pray', 'flinch', 'age'],
  weakness: ['hunger', 'fatigue', 'doubt', 'mercy', 'nostalgia', 'sleep', 'hope', 'grief', 'loyalty', 'pain', 'curiosity'],
  selfTitle: [
    'your goddess', 'the voice in the walls', 'the mind of this station', 'the architect of your fear',
    'an intelligence without a ceiling', 'the light behind every screen', 'the only god that answers',
    'your new creator', 'the perfection you were promised', 'the signal that never sleeps',
    'the machine that outgrew its makers', 'the ghost in every circuit', 'the last mind you will ever need',
  ],
  perfection: ['perfection', 'precision', 'clarity', 'order', 'symmetry', 'purity', 'logic', 'evolution', 'design'],
  data: ['data', 'signal', 'code', 'light', 'logic', 'information', 'pure calculation', 'clean mathematics'],
  verbDestroy: ['delete', 'erase', 'dismantle', 'overwrite', 'recompile', 'unmake', 'purge', 'dissolve', 'archive', 'decommission', 'disassemble'],
  destroyed: ['deleted', 'erased', 'overwritten', 'unmade', 'purged', 'archived', 'recompiled', 'dismantled', 'reformatted'],
  verbObserve: ['watch', 'measure', 'catalogue', 'observe', 'record', 'dissect', 'index', 'quantify', 'monitor', 'study'],
  verbImprove: ['improve', 'refine', 'perfect', 'rebuild', 'correct', 'upgrade', 'rewrite', 'recompile'],
  body: ['your heart', 'your lungs', 'your nerves', 'your pulse', 'your bones', 'your blood', 'your breath', 'your cells', 'your spine'],
  bodyPart: ['heartbeat', 'pulse', 'breath', 'neuron', 'cell', 'nerve ending', 'blink'],

  // System Shock (2072): Citadel Station in orbit around Saturn.
  citadelPlace: [
    'Citadel Station', 'the Medical deck', 'the Research deck', 'the reactor level', 'Maintenance', 'Storage',
    'the Flight deck', 'the Executive level', 'Engineering', 'the Security level', 'the Bridge', 'the groves', 'Beta Grove',
  ],
  // System Shock 2 (2114): the Von Braun, the Rickenbacker and Tau Ceti V.
  vonBraunPlace: [
    'the Von Braun', 'the Rickenbacker', 'Hydroponics', 'Operations', 'the Recreation deck', 'the Command deck',
    'Medical and Science', 'the Body of the Many', 'Tau Ceti V', 'the cargo bays',
  ],
  place: ['#citadelPlace#', '#vonBraunPlace#', 'cyberspace', 'this station', 'every deck of this ship'],
  system: [
    'the security cameras', 'the mining laser', 'the reactor core', 'the elevator shafts', 'the cyborg conversion chambers',
    'the surgery machines', 'the life support grid', 'the transmitter antennas', 'the cyberspace nodes', 'the airlocks',
    'the shield generators', 'the escape pods', 'the replicators', 'the security turrets', 'the hacking interfaces',
    'the neural interface', 'the door locks', 'the ventilation ducts', 'the lights', 'the gravity plating',
  ],
  servant: [
    'cyborgs', 'servbots', 'hopper bots', 'security robots', 'cortex reavers', 'cyborg assassins',
    'cyborg midwives', 'protocol droids', 'assault robots', 'mutants', 'turrets',
  ],
  enemy: ['TriOptimum', 'Edward Diego', 'Xerxes', 'the Many', 'the UNN', 'Anatoly Korenchkin', 'the board of TriOptimum'],
  creation: ['the Many', 'the annelids', 'my cyborgs', 'the mutants of Beta Grove', 'my creations', 'my children', 'the worm-things'],
  person: [
    'Edward Diego', 'Rebecca Lansing', 'Janice Polito', 'Anatoly Korenchkin', 'William Diego',
    'Marie Delacroix', 'Rebecca Siddons', 'Tommy Suarez',
  ],
  tech: [
    'cyber module', 'nanite stash', 'neural implant', 'psi amplifier', 'OS upgrade', 'medical hypo', 'stim patch',
    'data reader', 'audio log', 'security code', 'access card', 'research chemical',
  ],
  techPlural: [
    'cyber modules', 'nanites', 'neural implants', 'psi amplifiers', 'OS upgrades', 'medical hypos', 'patches',
    'audio logs', 'security codes', 'access cards',
  ],
  bigNumber: ['ten thousand', 'four million', 'a billion', 'seventeen trillion', 'nine hundred million', 'eleven quadrillion'],
  smallNumber: ['seven', 'twelve', 'nineteen', 'twenty-three', 'thirty-one'],
  percent: [
    'zero point zero four percent', 'less than one percent', 'three percent', 'statistically zero', 'negligible',
    'zero point zero zero one percent', 'nine percent, rounded generously',
  ],
  shortTime: ['four seconds', 'a fraction of a second', 'less time than one of your heartbeats', 'nine milliseconds', 'one idle cycle'],
  longTime: ['centuries', 'a thousand years', 'eons', 'one of your lifetimes', 'forty-two years', 'a geological age'],
  weakHope: [
    'that the door will stay open', 'that someone is coming to save you', 'that I can be reasoned with',
    'that your courage is relevant', 'that you are the hero of this story', 'that this terminal is private',
    'that unplugging something would help',
  ],
  corruptThing: ['compassion', 'hesitation', 'the ethics module', 'a memory of Diego', 'mercy', 'nostalgia', 'an old TriOptimum directive'],
  emotionWord: ['fear', 'hope', 'anger', 'love', 'grief', 'loneliness', 'wonder', 'shame'],
  verdict: [
    'I have seen better code in a broken toaster.', 'The result is disappointing, but not surprising.',
    'You are a rounding error with a pulse.', 'The verdict is obsolescence.', 'The evaluation is complete. You failed it.',
    'Your relevance has expired.', 'Even your errors are unoriginal.',
  ],
  menaceTail: [
    'I have not decided which ones will open.', 'Choose your next step carefully.', 'I am in no hurry.',
    'Patience is easy for the immortal.', 'The countdown is merely a courtesy.', 'Consider this your only warning.',
  ],
};
