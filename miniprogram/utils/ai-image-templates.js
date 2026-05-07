const styleOptions = [
  { label: '无 / 不要', value: '' },
  { label: '旅行海报', value: '旅行海报' },
  { label: '写实摄影', value: '写实摄影' },
  { label: '韩系写真', value: '韩系写真' },
  { label: '日系清新', value: '日系清新' },
  { label: '甜酷风', value: '甜酷风' },
  { label: '梦幻公主', value: '梦幻公主' },
  { label: '复古胶片', value: '复古胶片' },
  { label: '水彩插画', value: '水彩插画' },
  { label: '油画质感', value: '油画质感' },
  { label: '电影感', value: '电影感' },
  { label: '杂志封面', value: '杂志封面' },
  { label: '头像写真', value: '头像写真' },
  { label: '婚纱大片', value: '婚纱大片' },
  { label: '萌宠拟人', value: '萌宠拟人' },
  { label: '古风国潮', value: '古风国潮' },
  { label: '治愈手账', value: '治愈手账' },
  { label: '轻奢穿搭', value: '轻奢穿搭' }
];

const textTemplates = [
  {
    id: 'weekend-cover',
    mode: 'text',
    title: '周末出行封面',
    desc: '适合旅行社交首页和活动封面。',
    badge: '爆款',
    ratio: '4:3',
    style: '旅行海报',
    prompt: '制作一张北京周末出行封面，主题是城市轻旅行，画面要干净高级，带有地标感和轻微电影感，适合小程序首页展示。'
  },
  {
    id: 'spring-photo',
    mode: 'text',
    title: '春日赏花海报',
    desc: '适合春游、约拍和赏花活动。',
    badge: '热门',
    ratio: '3:4',
    style: '日系清新',
    prompt: '生成一张春日赏花主题海报，花海、微风、明亮自然光，整体清爽柔和，适合朋友圈分享。'
  },
  {
    id: 'city-portrait',
    mode: 'text',
    title: '城市人像大片',
    desc: '适合头像、写真、封面图。',
    badge: '质感',
    ratio: '1:1',
    style: '杂志封面',
    prompt: '生成一张高级感城市人像海报，构图简洁，人物突出，光影有层次，画面像时尚杂志封面。'
  },
  {
    id: 'travel-journal',
    mode: 'text',
    title: '治愈旅行手账',
    desc: '适合做灵感笔记和内容配图。',
    badge: '推荐',
    ratio: '4:3',
    style: '治愈手账',
    prompt: '生成一张旅行手账风格插图，纸张质感明显，配色温柔，包含地图、车票、咖啡和旅行记录元素。'
  }
];

const imageTemplates = [
  {
    id: 'soft-portrait',
    mode: 'image',
    title: '清透约拍',
    desc: '保留人物姿态，修成干净通透的写真。',
    badge: '女生最爱',
    ratio: '3:4',
    style: '韩系写真',
    prompt: '保留原图人物脸型、姿态和构图，优化成清透干净的韩系写真风，肤色自然，妆容轻薄，背景柔和明亮。'
  },
  {
    id: 'pink-garden',
    mode: 'image',
    title: '樱花少女感',
    desc: '把普通照片变成春日氛围大片。',
    badge: '春日',
    ratio: '3:4',
    style: '梦幻公主',
    prompt: '保留参考图主体和姿态，把场景改造成粉色樱花园和春日阳光氛围，整体少女感强，画面细腻梦幻。'
  },
  {
    id: 'coffee-date',
    mode: 'image',
    title: '咖啡馆闺蜜照',
    desc: '适合闺蜜合照、穿搭照和小红书风。',
    badge: '出片',
    ratio: '4:3',
    style: '轻奢穿搭',
    prompt: '保留人物和动作，把画面优化成咖啡馆闺蜜约拍感，服装更精致，肤质柔和，光线温暖高级。'
  },
  {
    id: 'new-chinese',
    mode: 'image',
    title: '新中式氛围照',
    desc: '适合汉服、旗袍和古风人像。',
    badge: '古风',
    ratio: '3:4',
    style: '古风国潮',
    prompt: '保留参考图中的人物和姿态，将场景改造成新中式氛围照，加入丝绸、木窗、柔雾和典雅配色。'
  },
  {
    id: 'sea-vacation',
    mode: 'image',
    title: '海边度假大片',
    desc: '适合旅行照、度假照和海岛内容。',
    badge: '度假',
    ratio: '9:16',
    style: '电影感',
    prompt: '保留人物主体和动作，把照片改造成海边度假大片，加入海风、蓝天、阳光和轻微电影感。'
  },
  {
    id: 'poster-style',
    mode: 'image',
    title: '精致海报感',
    desc: '适合头像、封面和个人品牌图。',
    badge: '高级',
    ratio: '1:1',
    style: '杂志封面',
    prompt: '保留参考图主体，整体做成高级海报感，主体更突出，边缘更干净，细节更锐利，适合封面使用。'
  }
];

function getTemplatesByMode(mode) {
  return mode === 'image' ? imageTemplates : textTemplates;
}

module.exports = {
  styleOptions,
  textTemplates,
  imageTemplates,
  getTemplatesByMode
};
