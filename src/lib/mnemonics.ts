// Major System digit-to-consonant mapping
const DIGIT_TO_CONSONANTS: Record<string, string[]> = {
  "0": ["s", "z"],
  "1": ["t", "d"],
  "2": ["n"],
  "3": ["m"],
  "4": ["r"],
  "5": ["l"],
  "6": ["j", "sh", "ch"],
  "7": ["k", "g", "c"],
  "8": ["f", "v"],
  "9": ["p", "b"],
};

// Map a word to its Major System consonant pattern
function wordToDigits(word: string): string {
  const w = word.toLowerCase();
  let result = "";
  let i = 0;
  while (i < w.length) {
    const ch = w[i];
    const next = w[i + 1] || "";
    // Multi-char consonants
    if (ch === "s" && next === "h") { result += "6"; i += 2; continue; }
    if (ch === "c" && next === "h") { result += "6"; i += 2; continue; }
    if (ch === "t" && next === "h") { result += "1"; i += 2; continue; }
    if (ch === "p" && next === "h") { result += "8"; i += 2; continue; }
    // Single consonants
    if (ch === "s" || ch === "z") { result += "0"; i++; continue; }
    if (ch === "t" || ch === "d") { result += "1"; i++; continue; }
    if (ch === "n") { result += "2"; i++; continue; }
    if (ch === "m") { result += "3"; i++; continue; }
    if (ch === "r") { result += "4"; i++; continue; }
    if (ch === "l") { result += "5"; i++; continue; }
    if (ch === "j") { result += "6"; i++; continue; }
    if (ch === "k" || ch === "q") { result += "7"; i++; continue; }
    if (ch === "g") {
      // soft g before e, i, y
      if ("eiy".includes(next)) { result += "6"; } else { result += "7"; }
      i++; continue;
    }
    if (ch === "c") {
      // soft c before e, i, y
      if ("eiy".includes(next)) { result += "0"; } else { result += "7"; }
      i++; continue;
    }
    if (ch === "f" || ch === "v") { result += "8"; i++; continue; }
    if (ch === "p" || ch === "b") { result += "9"; i++; continue; }
    // Skip vowels and non-mapped consonants (h, w, y, x)
    if (ch === "x") { result += "70"; i++; continue; } // x = k+s
    i++;
  }
  return result;
}

// Built-in dictionary of common words mapped by Major System encoding
// Key = digit pattern, Value = array of words
const DICTIONARY: Record<string, string[]> = {};

// ~500 common English words
const WORD_LIST = [
  "ace","ass","ash","ate","add","aid","aim","air","ale","all",
  "am","an","ape","arc","are","ark","arm","art","awe","axe",
  "bag","ball","ban","bar","bat","bay","beam","bear","bed","bee",
  "bell","belt","bench","bid","big","bill","bird","bit","black","blade",
  "block","blood","blow","blue","board","boat","body","bolt","bomb","bone",
  "book","boot","born","boss","bow","bowl","box","boy","brain","brave",
  "bread","break","brick","bride","brown","brush","buck","bud","bug","bull",
  "burn","bus","bush","cab","cage","cake","call","calm","came","camp",
  "can","cap","car","card","care","case","cash","cast","cat","catch",
  "cave","cell","chain","chair","chalk","chance","change","chase","cheap","check",
  "cheese","chief","child","chin","chip","choice","church","circle","city","claim",
  "class","clean","clear","climb","clock","close","cloud","club","coach","coal",
  "coat","code","coin","cold","come","cook","cool","cope","copy","cord",
  "core","corn","cost","couch","count","court","cover","cow","crack","crash",
  "cream","crew","crime","cross","crowd","crown","cry","cup","cure","curl",
  "cut","dad","dam","dance","dark","dash","dawn","day","dead","deal",
  "dear","death","debt","deck","deep","deer","desk","dial","dice","dig",
  "dim","dine","dirt","dish","dive","dock","dog","doll","dome","done",
  "doom","door","dot","down","draft","drain","draw","dream","dress","drill",
  "drink","drive","drop","drum","dry","duck","dull","dumb","dump","dust",
  "each","ear","earth","ease","east","eat","edge","egg","eight","elm",
  "end","eve","eye","face","fact","fade","fail","fair","faith","fall",
  "fame","fan","far","farm","fast","fat","fate","fear","feed","feel",
  "fell","fence","few","field","fig","fight","file","fill","film","fin",
  "find","fine","fire","firm","fish","fist","fit","five","fix","flag",
  "flame","flash","flat","flesh","flight","flip","float","floor","flow","fly",
  "foam","fog","fold","folk","food","fool","foot","force","fork","form",
  "fort","found","four","fox","frame","free","fresh","frog","front","fruit",
  "fuel","full","fun","fur","gain","game","gap","gas","gate","gave",
  "gem","ghost","gift","girl","give","glad","glass","globe","glow","glue",
  "goal","goat","gold","golf","gone","good","grab","grace","grade","grain",
  "grand","grant","grape","grass","grave","gray","great","green","grew","grief",
  "grill","grin","grip","ground","group","grow","guard","guess","guide","guilt",
  "gun","gut","guy","gym","had","hair","half","hall","ham","hand",
  "hang","hard","harm","hat","hate","have","hay","head","heal","heap",
  "hear","heart","heat","heel","help","hen","her","here","hide","high",
  "hill","him","hint","hip","hire","hit","hold","hole","home","honey",
  "hook","hope","horn","horse","host","hot","hour","house","how","hub",
  "huge","hull","hung","hunt","hurt","ice","ill","inch","ink","inn",
  "iron","isle","itch","ivy","jack","jail","jam","jar","jaw","jet",
  "job","join","joke","joy","judge","jug","juice","jump","just","keen",
  "keep","kept","key","kick","kid","kill","kind","king","kiss","kit",
  "knee","knot","know","lab","lace","lack","lad","lake","lamb","lamp",
  "land","lane","lap","large","last","late","laugh","launch","law","lawn",
  "lay","lead","leaf","lean","learn","leave","left","leg","lemon","less",
  "let","lid","lie","life","lift","light","like","limb","lime","line",
  "link","lion","lip","list","live","load","loan","lock","log","long",
  "look","loop","lord","lose","loss","lost","lot","loud","love","low",
  "luck","lump","lunch","lung","mad","made","mail","main","make","male",
  "mall","man","map","march","mark","mass","match","mate","math","may",
  "meal","mean","meat","meet","melt","men","mend","mess","met","mice",
  "mild","milk","mill","mind","mine","miss","mix","mob","mode","mole",
  "moon","more","moss","most","moth","mount","mouse","mouth","move","much",
  "mud","mug","must","myth","nail","name","navy","near","neat","neck",
  "need","nest","net","new","news","nice","night","nine","nod","none",
  "noon","nor","nose","note","noun","now","null","nurse","nut","oak",
  "odd","off","oil","old","one","open","or","order","our","out",
  "oven","over","owe","own","pace","pack","pad","page","paid","pain",
  "pair","pale","palm","pan","park","part","pass","past","patch","path",
  "pay","peace","peak","pen","pet","pick","pie","pig","pile","pill",
  "pin","pipe","pit","place","plain","plan","plant","plate","play","plot",
  "plug","plus","poem","point","pole","poll","pool","poor","pop","pork",
  "port","pose","post","pot","pour","pray","press","price","pride","prime",
  "print","prize","proof","pull","pump","punch","pure","push","put",
];

// Build dictionary
for (const word of WORD_LIST) {
  const pattern = wordToDigits(word);
  if (pattern.length === 0) continue;
  if (!DICTIONARY[pattern]) DICTIONARY[pattern] = [];
  DICTIONARY[pattern].push(word);
}

export function digitsToConsonants(digits: string): string {
  return digits.split("").map((d) => {
    const consonants = DIGIT_TO_CONSONANTS[d];
    return consonants ? consonants[0] : "?";
  }).join("-");
}

export function generateMnemonicSuggestions(digits: string): string[] {
  const suggestions: string[] = [];

  // Try full pattern match
  const fullPattern = digits.split("").map((d) => wordToDigitsPattern(d)).join("");
  const directWords = DICTIONARY[digits];
  if (directWords) {
    suggestions.push(...directWords.slice(0, 2));
  }

  // Try splitting into 2-digit and 3-digit pairs
  if (digits.length >= 4) {
    for (let split = 2; split <= 3 && split < digits.length; split++) {
      const left = digits.slice(0, split);
      const right = digits.slice(split);
      const leftWords = DICTIONARY[left] || [];
      const rightWords = DICTIONARY[right] || [];
      if (leftWords.length > 0 && rightWords.length > 0) {
        suggestions.push(`${leftWords[0]} ${rightWords[0]}`);
        if (leftWords.length > 1 || rightWords.length > 1) {
          suggestions.push(`${leftWords[leftWords.length > 1 ? 1 : 0]} ${rightWords[rightWords.length > 1 ? 1 : 0]}`);
        }
      }
    }
  }

  // Try 3-way split for 5 digits
  if (digits.length === 5) {
    for (const [a, b] of [[2, 2], [2, 1], [1, 2], [1, 3], [3, 1]]) {
      const c = digits.length - a - b;
      if (c < 1) continue;
      const p1 = DICTIONARY[digits.slice(0, a)] || [];
      const p2 = DICTIONARY[digits.slice(a, a + b)] || [];
      const p3 = DICTIONARY[digits.slice(a + b)] || [];
      if (p1.length > 0 && p2.length > 0 && p3.length > 0) {
        suggestions.push(`${p1[0]} ${p2[0]} ${p3[0]}`);
        break;
      }
    }
  }

  // Show consonant hint as fallback
  const consonantHint = digitsToConsonants(digits);
  if (suggestions.length === 0) {
    suggestions.push(`[${consonantHint}]`);
  }

  // Deduplicate and limit
  return [...new Set(suggestions)].slice(0, 5);
}

function wordToDigitsPattern(digit: string): string {
  return digit;
}
