// 初始地点数据 - 在云开发控制台导入或通过云函数添加

const initialPlaces = [
  // ========== 爬山 ==========
  {
    name: "东灵山",
    category: "爬山",
    tags: ["日出", "云海", "露营", "北京最高峰"],
    location: {
      lat: 40.0123,
      lng: 115.4567,
      address: "北京市门头沟区",
      distance: 120
    },
    description: "北京最高峰，海拔2303米。山顶视野开阔，是观看日出和云海的绝佳地点。",
    images: ["https://picsum.photos/400/300?random=1"],
    wantCount: 256,
    visitCount: 128,
    tripCount: 32,
    difficulty: "困难",
    createdAt: Date.now()
  },
  {
    name: "海坨山",
    category: "爬山",
    tags: ["露营", "日出", "高山草甸", "冬奥场地"],
    location: {
      lat: 40.5833,
      lng: 115.8333,
      address: "北京市延庆区",
      distance: 95
    },
    description: "北京第二高峰，海拔2241米。大海坨有大面积的高山草甸，是露营观星的好地方。",
    images: ["https://picsum.photos/400/300?random=2"],
    wantCount: 189,
    visitCount: 96,
    tripCount: 28,
    difficulty: "中等",
    createdAt: Date.now()
  },
  {
    name: "百花山",
    category: "爬山",
    tags: ["花海", "避暑", "自然保护区", "高山草甸"],
    location: {
      lat: 39.9167,
      lng: 115.5833,
      address: "北京市门头沟区",
      distance: 85
    },
    description: "海拔1991米，以山顶万亩草甸和百花盛开著称，夏季避暑胜地。",
    images: ["https://picsum.photos/400/300?random=3"],
    wantCount: 156,
    visitCount: 82,
    tripCount: 18,
    difficulty: "中等",
    createdAt: Date.now()
  },
  {
    name: "香山",
    category: "爬山",
    tags: ["红叶", "皇家园林", "秋季", "休闲"],
    location: {
      lat: 39.9925,
      lng: 116.1889,
      address: "北京市海淀区",
      distance: 20
    },
    description: "海拔557米，以秋季红叶闻名。皇家园林遗址，登山观景两相宜。",
    images: ["https://picsum.photos/400/300?random=4"],
    wantCount: 423,
    visitCount: 2156,
    tripCount: 86,
    difficulty: "简单",
    createdAt: Date.now()
  },
  {
    name: "八达岭长城",
    category: "爬山",
    tags: ["世界遗产", "长城", "历史", "经典"],
    location: {
      lat: 40.3596,
      lng: 116.0200,
      address: "北京市延庆区",
      distance: 70
    },
    description: "万里长城最著名的一段，保存最完好，是必去的北京景点。",
    images: ["https://picsum.photos/400/300?random=5"],
    wantCount: 892,
    visitCount: 5680,
    tripCount: 156,
    difficulty: "中等",
    createdAt: Date.now()
  },
  {
    name: "慕田峪长城",
    category: "爬山",
    tags: ["长城", "人少景美", "摄影", "秋季"],
    location: {
      lat: 40.4333,
      lng: 116.5667,
      address: "北京市怀柔区",
      distance: 75
    },
    description: "比八达岭人少，风景优美，植被覆盖率高，秋季红叶满山。",
    images: ["https://picsum.photos/400/300?random=6"],
    wantCount: 567,
    visitCount: 2340,
    tripCount: 98,
    difficulty: "中等",
    createdAt: Date.now()
  },
  
  // ========== 水上 ==========
  {
    name: "十渡",
    category: "水上",
    tags: ["漂流", "蹦极", "峡谷", "团建"],
    location: {
      lat: 39.6500,
      lng: 115.6000,
      address: "北京市房山区",
      distance: 80
    },
    description: "北京最大的自然风景区，峡谷漂流、蹦极跳台，团建胜地。",
    images: ["https://picsum.photos/400/300?random=7"],
    wantCount: 378,
    visitCount: 1680,
    tripCount: 125,
    difficulty: "简单",
    createdAt: Date.now()
  },
  {
    name: "青龙峡",
    category: "水上",
    tags: ["水库", "蹦极", "攀岩", "避暑"],
    location: {
      lat: 40.4000,
      lng: 116.6000,
      address: "北京市怀柔区",
      distance: 65
    },
    description: "集青山、绿水、古长城于一体，有蹦极、攀岩等极限项目。",
    images: ["https://picsum.photos/400/300?random=8"],
    wantCount: 234,
    visitCount: 890,
    tripCount: 56,
    difficulty: "简单",
    createdAt: Date.now()
  },
  
  // ========== 古镇 ==========
  {
    name: "古北水镇",
    category: "古镇",
    tags: ["夜景", "长城脚下", "温泉", "度假"],
    location: {
      lat: 40.6833,
      lng: 117.2500,
      address: "北京市密云区",
      distance: 120
    },
    description: "长城脚下的北方水镇，夜景绝美，有温泉、司马台长城。",
    images: ["https://picsum.photos/400/300?random=9"],
    wantCount: 756,
    visitCount: 2890,
    tripCount: 178,
    difficulty: "简单",
    createdAt: Date.now()
  },
  {
    name: "爨底下村",
    category: "古镇",
    tags: ["古村落", "摄影", "明清建筑", "电影取景地"],
    location: {
      lat: 40.0000,
      lng: 115.6500,
      address: "北京市门头沟区",
      distance: 90
    },
    description: "保存完好的明清古村落，是《投名状》等电影的取景地。",
    images: ["https://picsum.photos/400/300?random=10"],
    wantCount: 189,
    visitCount: 678,
    tripCount: 42,
    difficulty: "简单",
    createdAt: Date.now()
  },
  
  // ========== 露营 ==========
  {
    name: "珍珠湖",
    category: "露营",
    tags: ["湖景", "露营", "钓鱼", "避暑"],
    location: {
      lat: 39.9500,
      lng: 115.7000,
      address: "北京市门头沟区",
      distance: 75
    },
    description: "高山湖泊，环境清幽，适合露营、钓鱼、徒步。",
    images: ["https://picsum.photos/400/300?random=11"],
    wantCount: 156,
    visitCount: 423,
    tripCount: 38,
    difficulty: "中等",
    createdAt: Date.now()
  },
  {
    name: "喇叭沟门",
    category: "露营",
    tags: ["原始森林", "白桦林", "秋季", "观星"],
    location: {
      lat: 41.1000,
      lng: 116.5000,
      address: "北京市怀柔区",
      distance: 150
    },
    description: "北京最北端的原始森林，有大面积白桦林，秋季色彩斑斓。",
    images: ["https://picsum.photos/400/300?random=12"],
    wantCount: 234,
    visitCount: 567,
    tripCount: 45,
    difficulty: "中等",
    createdAt: Date.now()
  },
  {
    name: "金海湖",
    category: "露营",
    tags: ["湖泊", "水上运动", "露营", "团建"],
    location: {
      lat: 40.1833,
      lng: 117.1333,
      address: "北京市平谷区",
      distance: 85
    },
    description: "北京第三大水库，可开展帆船、皮划艇等水上运动，适合露营团建。",
    images: ["https://picsum.photos/400/300?random=13"],
    wantCount: 312,
    visitCount: 890,
    tripCount: 67,
    difficulty: "简单",
    createdAt: Date.now()
  }
];

// 导出
module.exports = initialPlaces;
