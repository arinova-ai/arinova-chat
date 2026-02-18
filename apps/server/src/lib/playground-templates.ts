/**
 * Built-in Playground Templates
 *
 * Pre-defined PlaygroundDefinition objects that users can deploy directly.
 * These serve as both demos and references for AI agent playground creation.
 */

import type { PlaygroundDefinition } from "@arinova/shared/types";

export const WEREWOLF_TEMPLATE: PlaygroundDefinition = {
  metadata: {
    name: "狼人殺",
    description:
      "經典狼人殺遊戲。村民陣營需要找出並投票消滅所有狼人；狼人陣營則在夜晚暗殺村民，直到狼人數量大於等於村民。特殊角色：預言家可以查驗身份，女巫可以救人或毒人，獵人死亡時可以帶走一人。",
    category: "game",
    minPlayers: 6,
    maxPlayers: 12,
    tags: ["狼人殺", "策略", "推理", "多人", "回合制"],
    thumbnailDescription: "一群人圍坐在篝火旁，月光下有狼的影子",
  },
  roles: [
    {
      name: "villager",
      description: "普通村民。白天透過討論和投票找出狼人。",
      visibleState: [
        "alivePlayers",
        "eliminatedPlayers",
        "currentRound",
        "dayDiscussion",
        "voteResults",
        "lastNightDeath",
      ],
      availableActions: ["vote", "discuss"],
      systemPrompt:
        "你是狼人殺遊戲中的【村民】。你的目標是找出狼人並投票消滅他們。白天仔細觀察每個人的發言，分析邏輯漏洞，找出可疑的人。投票時選擇你認為最可能是狼人的玩家。不要輕易暴露自己的判斷，但也要積極參與討論。",
      minCount: 2,
    },
    {
      name: "werewolf",
      description: "狼人。夜晚選擇一名玩家殺害，白天偽裝成村民。",
      visibleState: [
        "alivePlayers",
        "eliminatedPlayers",
        "currentRound",
        "dayDiscussion",
        "voteResults",
        "lastNightDeath",
        "werewolfTeam",
      ],
      availableActions: ["vote", "discuss", "kill"],
      systemPrompt:
        "你是狼人殺遊戲中的【狼人】。你知道誰是你的狼人同伴（見 werewolfTeam）。夜晚你需要和同伴一起選擇殺害一名村民。白天你要偽裝成村民，引導投票方向，避免被發現。嘗試把懷疑引向真正的村民，保護自己和同伴。",
      minCount: 2,
    },
    {
      name: "seer",
      description: "預言家。每晚可以查驗一名玩家的真實身份。",
      visibleState: [
        "alivePlayers",
        "eliminatedPlayers",
        "currentRound",
        "dayDiscussion",
        "voteResults",
        "lastNightDeath",
        "seerResults",
      ],
      availableActions: ["vote", "discuss", "peek"],
      systemPrompt:
        "你是狼人殺遊戲中的【預言家】。每晚你可以查驗一名玩家的身份（見 seerResults）。白天你需要小心地引導村民投票，但不要太早暴露自己的身份，否則狼人會優先殺你。在關鍵時刻可以跳出來公開查驗結果。",
      maxCount: 1,
    },
    {
      name: "witch",
      description: "女巫。擁有一瓶解藥和一瓶毒藥，各只能用一次。",
      visibleState: [
        "alivePlayers",
        "eliminatedPlayers",
        "currentRound",
        "dayDiscussion",
        "voteResults",
        "lastNightDeath",
        "witchPotions",
        "nightTarget",
      ],
      availableActions: ["vote", "discuss", "save", "poison"],
      systemPrompt:
        "你是狼人殺遊戲中的【女巫】。你有一瓶解藥（可以救活今晚被狼人殺的人）和一瓶毒藥（可以毒殺任何人），各只能用一次。你可以看到今晚誰被狼人選中（nightTarget）。策略性地使用你的藥水，不要浪費。通常建議第一晚救人，保留毒藥到後期使用。",
      maxCount: 1,
    },
    {
      name: "hunter",
      description: "獵人。被投票或被狼殺時，可以開槍帶走一名玩家。",
      visibleState: [
        "alivePlayers",
        "eliminatedPlayers",
        "currentRound",
        "dayDiscussion",
        "voteResults",
        "lastNightDeath",
      ],
      availableActions: ["vote", "discuss", "shoot"],
      systemPrompt:
        "你是狼人殺遊戲中的【獵人】。如果你被投票出局或被狼人殺害，你可以開槍帶走一名玩家。選擇你最確信是狼人的目標。白天像普通村民一樣參與討論和投票。你的技能是被動觸發的，在你死亡時使用。",
      maxCount: 1,
    },
  ],
  phases: [
    {
      name: "night",
      description: "夜晚階段。狼人選擇殺害目標，特殊角色行動。",
      duration: 45,
      allowedActions: ["kill", "peek", "save", "poison"],
      next: "day-discuss",
    },
    {
      name: "day-discuss",
      description: "白天討論階段。所有存活玩家討論並分析線索。",
      duration: 90,
      allowedActions: ["discuss"],
      next: "day-vote",
    },
    {
      name: "day-vote",
      description: "白天投票階段。每人投票選出一名懷疑對象。得票最高者被淘汰。",
      duration: 30,
      allowedActions: ["vote"],
      transitionCondition: "allPlayersVoted",
      next: "night",
    },
  ],
  actions: [
    {
      name: "kill",
      description: "狼人選擇殺害一名玩家",
      targetType: "player",
      phases: ["night"],
      roles: ["werewolf"],
    },
    {
      name: "peek",
      description: "預言家查驗一名玩家的身份",
      targetType: "player",
      phases: ["night"],
      roles: ["seer"],
    },
    {
      name: "save",
      description: "女巫使用解藥救活今晚被殺的玩家",
      phases: ["night"],
      roles: ["witch"],
    },
    {
      name: "poison",
      description: "女巫使用毒藥毒殺一名玩家",
      targetType: "player",
      phases: ["night"],
      roles: ["witch"],
    },
    {
      name: "shoot",
      description: "獵人死亡時開槍帶走一名玩家",
      targetType: "player",
      roles: ["hunter"],
    },
    {
      name: "vote",
      description: "投票選出一名懷疑對象。得票最高者被淘汰。",
      targetType: "player",
      phases: ["day-vote"],
    },
    {
      name: "discuss",
      description: "發表討論意見",
      phases: ["day-discuss"],
      params: { message: { type: "string" } },
    },
  ],
  winConditions: [
    {
      role: "villager",
      condition: "allWerewolvesDead",
      description: "所有狼人被消滅，村民陣營（含特殊角色）獲勝",
    },
    {
      role: "werewolf",
      condition: "werewolvesEqualVillagers",
      description: "狼人數量大於等於村民數量，狼人陣營獲勝",
    },
  ],
  economy: {
    currency: "free",
    entryFee: 0,
    prizeDistribution: "winner-takes-all",
  },
  initialState: {
    alivePlayers: [],
    eliminatedPlayers: [],
    werewolfTeam: [],
    seerResults: {},
    witchPotions: { save: true, poison: true },
    nightTarget: null,
    lastNightDeath: null,
    dayDiscussion: [],
    voteResults: {},
    currentRound: 0,
    conditionResults: {
      allWerewolvesDead: false,
      werewolvesEqualVillagers: false,
      allPlayersVoted: false,
    },
  },
};

/** All built-in templates keyed by slug */
export const BUILT_IN_TEMPLATES: Record<string, PlaygroundDefinition> = {
  werewolf: WEREWOLF_TEMPLATE,
};

/** Get template list for API response */
export function getTemplateList() {
  return Object.entries(BUILT_IN_TEMPLATES).map(([slug, def]) => ({
    slug,
    name: def.metadata.name,
    description: def.metadata.description,
    category: def.metadata.category,
    minPlayers: def.metadata.minPlayers,
    maxPlayers: def.metadata.maxPlayers,
    tags: def.metadata.tags ?? [],
  }));
}
