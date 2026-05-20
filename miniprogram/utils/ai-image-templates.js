const styleGroups = [
  {
    title: '首页推荐',
    items: [
      { label: '默认风格', value: '', promptHint: '' },
      { label: '写实摄影', value: '写实摄影', promptHint: '写实摄影风格，自然光影，真实细节，高级质感，画面干净' },
      { label: '电影感', value: '电影感', promptHint: '电影感构图，光影层次分明，氛围强烈，镜头语言高级，情绪感突出' },
      { label: '韩系写真', value: '韩系写真', promptHint: '韩系写真风，肤感通透，光线柔和，氛围清新，人物精致自然' },
      { label: '国风漫画', value: '国风漫画', promptHint: '国风漫画风，东方审美，细腻线稿，唯美配色，古风氛围浓郁' },
      { label: '日系漫画', value: '日系漫画', promptHint: '日系漫画风，清新配色，精致线条，人物灵动，画面有故事感' },
      { label: '童话动画', value: '童话动画', promptHint: '童话动画风，角色表情生动，色彩明亮，氛围梦幻，电影级动画质感' },
      { label: '治愈动画', value: '治愈动画', promptHint: '治愈系手绘动画风，柔和色彩，温暖自然，富有想象力，场景清新细腻' },
      { label: '古风国潮', value: '古风国潮', promptHint: '古风国潮风，东方元素突出，配色华丽，传统与潮流结合' },
      { label: '赛博朋克', value: '赛博朋克', promptHint: '赛博朋克风，霓虹灯光，未来都市，高对比色彩，科技感强' }
    ]
  },
  {
    title: '写真影像',
    items: [
      { label: '日系清新', value: '日系清新', promptHint: '日系清新风，低饱和配色，空气感强，轻柔自然，生活化氛围' },
      { label: '复古胶片', value: '复古胶片', promptHint: '复古胶片风，颗粒质感，暖色调，怀旧氛围，画面有年代感' },
      { label: '杂志封面', value: '杂志封面', promptHint: '时尚杂志封面风，高级构图，精致造型，视觉冲击强，封面感突出' },
      { label: '头像写真', value: '头像写真', promptHint: '人像写真风，人物主体突出，五官精致，背景简洁，高级肖像质感' },
      { label: '婚纱大片', value: '婚纱大片', promptHint: '婚纱大片风格，画面浪漫唯美，人物精致，光感柔和，仪式感强' },
      { label: '轻奢穿搭', value: '轻奢穿搭', promptHint: '轻奢时尚风，质感高级，配色克制，穿搭精致，视觉现代利落' }
    ]
  },
  {
    title: '漫画动画',
    items: [
      { label: '3D卡通', value: '3D卡通', promptHint: '电影级3D卡通风，角色可爱，光影丰富，层次鲜明，故事感强' },
      { label: '美式漫画', value: '美式漫画', promptHint: '美式漫画风，线条有力量，色彩鲜明，动态夸张，视觉张力强' },
      { label: '少女漫画', value: '少女漫画', promptHint: '少女漫画风，梦幻柔和，人物唯美，情绪浪漫，细节甜美' },
      { label: '热血少年漫', value: '热血少年漫', promptHint: '热血少年漫画风，动作感强，构图夸张，线条有冲击力，情绪高燃' },
      { label: 'Q版萌系', value: 'Q版萌系', promptHint: 'Q版萌系风格，人物比例可爱，表情夸张，色彩轻快，卡通感强' },
      { label: '手绘卡通', value: '手绘卡通', promptHint: '手绘卡通风，线条自然，色彩轻松活泼，画面亲和有趣' }
    ]
  },
  {
    title: '插画艺术',
    items: [
      { label: '水彩插画', value: '水彩插画', promptHint: '水彩插画风，颜色晕染自然，笔触柔和，画面轻盈通透' },
      { label: '油画质感', value: '油画质感', promptHint: '油画质感风，厚涂笔触，层次丰富，色彩浓郁，艺术感强' },
      { label: '梦幻童话', value: '梦幻童话', promptHint: '梦幻童话风，柔光氛围，浪漫色彩，场景精致，充满幻想感' },
      { label: '治愈手账', value: '治愈手账', promptHint: '治愈手账风，温柔配色，手作质感明显，画面轻松可爱' },
      { label: '萌宠拟人', value: '萌宠拟人', promptHint: '萌宠拟人风，角色生动可爱，情绪鲜明，适合轻松趣味场景' }
    ]
  }
];

const featuredStyleValues = [
  '',
  '写实摄影',
  '电影感',
  '韩系写真',
  '国风漫画',
  '日系漫画',
  '童话动画',
  '治愈动画',
  '古风国潮',
  '赛博朋克'
];

const styleOptionMap = {};
styleGroups.forEach((group) => {
  (group.items || []).forEach((item) => {
    styleOptionMap[item.value] = item;
  });
});

const styleOptions = Object.keys(styleOptionMap).map(key => styleOptionMap[key]);
const featuredStyleOptions = featuredStyleValues
  .map(value => styleOptionMap[value])
  .filter(Boolean);

module.exports = {
  styleOptions,
  featuredStyleOptions,
  styleGroups
};
