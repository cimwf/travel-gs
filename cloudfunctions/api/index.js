const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const auth = require('./handlers/auth');
const user = require('./handlers/user');
const place = require('./handlers/place');
const trip = require('./handlers/trip');
const tripLog = require('./handlers/tripLog');
const tripMedia = require('./handlers/tripMedia');
const tripComment = require('./handlers/tripComment');
const apply = require('./handlers/apply');
const want = require('./handlers/want');
const message = require('./handlers/message');
const comment = require('./handlers/comment');
const banner = require('./handlers/banner');
const attractions = require('./handlers/attractions');
const userSpots = require('./handlers/userSpots');
const feedback = require('./handlers/feedback');
const report = require('./handlers/report');
const community = require('./handlers/community');
const notification = require('./handlers/notification');
const adminCommunity = require('./handlers/adminCommunity');
const adminTrip = require('./handlers/adminTrip');
const adminTripLog = require('./handlers/adminTripLog');
const adminReport = require('./handlers/adminReport');
const adminData = require('./handlers/adminData');
const adminOfficialCommunity = require('./handlers/adminOfficialCommunity');
const adminSystemConfig = require('./handlers/adminSystemConfig');
const { resolveDataEnvironment } = require('./utils/dataEnvironment');

exports.main = async (event, context) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const dataEnvironment = resolveDataEnvironment(event);

  try {
    switch (action) {
      // ========== 认证相关 ==========
      case 'auth/publicKey':
        return await auth.getPublicKey();
      case 'auth/trackEvent':
        return await auth.authTrackEvent(data);

      // ========== 用户相关 ==========
      case 'user/register':
        return await user.userRegister(openid, data);
      case 'user/login':
        return await user.userLogin(openid, data);
      case 'user/loginPassword':
        return await user.userLoginPassword(data);
      case 'user/loginByPhone':
        return await user.userLoginByPhone(openid, data);
      case 'user/update':
        return await user.userUpdate(openid, data);
      case 'user/get':
        return await user.userGet(openid, data.userId || openid);
      case 'user/followStatus':
        return await user.userFollowStatus(openid, data);
      case 'user/followToggle':
        return await user.userFollowToggle(openid, data);
      case 'user/followList':
        return await user.userFollowList(openid, data);

      // ========== 地点相关 ==========
      case 'place/list':
        return await place.placeList(data);
      case 'place/get':
        return await place.placeGet(data.placeId);
      case 'place/view':
        return await place.placeView(data.placeId);
      case 'place/search':
        return await place.placeSearch(data.keyword);

      // ========== 行程相关 ==========
      case 'trip/create':
        return await trip.tripCreate(openid, data, dataEnvironment);
      case 'trip/list':
        return await trip.tripList(openid, data, dataEnvironment);
      case 'trip/get':
        return await trip.tripGet(openid, data.tripId);
      case 'trip/view':
        return await trip.tripView(data.tripId);
      case 'trip/join':
        return await trip.tripJoin(openid, data);
      case 'trip/quit':
        return await trip.tripQuit(openid, data);
      case 'trip/removeMember':
        return await trip.tripRemoveMember(openid, data);
      case 'trip/updateStatus':
        return await trip.tripUpdateStatus(openid, data);
      case 'trip/delete':
        return await trip.tripDelete(openid, data);
      case 'trip/update':
        return await trip.tripUpdate(openid, data);
      case 'trip/my':
        return await trip.tripMy(openid);
      case 'trip/listByUser':
        return await trip.tripListByUser(openid, data, dataEnvironment);
      case 'tripMedia/createUploadSession':
        return await tripMedia.tripMediaCreateUploadSession(openid, data);

      // ========== 行程日志相关 ==========
      case 'tripLog/start':
        return await tripLog.tripLogStart(openid, data);
      case 'tripLog/end':
        return await tripLog.tripLogEnd(openid, data);
      case 'tripLog/list':
        return await tripLog.tripLogList(openid, data);
      case 'tripLog/create':
        return await tripLog.tripLogCreate(openid, data);
      case 'tripLog/delete':
        return await tripLog.tripLogDelete(openid, data);
      case 'tripLog/authorize':
        return await tripLog.tripLogAuthorize(openid, data);
      case 'tripLog/unauthorize':
        return await tripLog.tripLogUnauthorize(openid, data);

      // ========== 行程评论相关 ==========
      case 'tripComment/list':
        return await tripComment.tripCommentList(openid, data);
      case 'tripComment/replyList':
        return await tripComment.tripReplyList(openid, data);
      case 'tripComment/create':
        return await tripComment.tripCommentCreate(openid, data);
      case 'tripComment/delete':
        return await tripComment.tripCommentDelete(openid, data);

      // ========== 申请相关 ==========
      case 'apply/create':
        return await apply.applyCreate(openid, data);
      case 'apply/list':
        return await apply.applyList(openid, data);
      case 'apply/handle':
        return await apply.applyHandle(openid, data);
      case 'apply/notifications':
        return await apply.applyNotifications(openid, data?.page || 1, data?.pageSize || 5);
      case 'apply/delete':
        return await apply.applyDelete(openid, data);
      case 'apply/cancel':
        return await apply.applyCancel(openid, data);
      case 'apply/unreadCount':
        return await apply.applyUnreadCount(openid);
      case 'apply/markRead':
        return await apply.applyMarkRead(openid);

      // ========== 想去相关 ==========
      case 'want/toggle':
        return await want.wantToggle(openid, data);
      case 'want/list':
        return await want.wantList(openid);

      // ========== 消息相关 ==========
      case 'message/send':
        return await message.messageSend(openid, data);
      case 'message/list':
        return await message.messageList(openid, data);
      case 'message/read':
        return await message.messageRead(data.messageId);

      // ========== 通知中心 ==========
      case 'notification/list':
        return await notification.notificationList(openid, data);
      case 'notification/unreadCount':
        return await notification.notificationUnreadCount(openid);
      case 'notification/markRead':
        return await notification.notificationMarkRead(openid, data);
      case 'notification/markAllRead':
        return await notification.notificationMarkAllRead(openid, data);

      // ========== 评论相关 ==========
      case 'comment/create':
        return await comment.commentCreate(openid, data);
      case 'comment/list':
        return await comment.commentList(data.placeId);

      // ========== Banner相关 ==========
      case 'banner/list':
        return await banner.bannerList();

      // ========== 反馈相关 ==========
      case 'feedback/create':
        return await feedback.feedbackCreate(openid, data);

      // ========== 举报相关 ==========
      case 'report/create':
        return await report.reportCreate(openid, data);

      // ========== 景点相关 ==========
      case 'attractions/list':
        return await attractions.attractionsList();
      case 'attractions/get':
        return await attractions.attractionsGet(data.placeId);

      // ========== 用户上传景点相关 ==========
      case 'userSpots/create':
        return await userSpots.userSpotsCreate(openid, data);

      // ========== 社区相关 ==========
      case 'community/list':
        return await community.communityList(openid, data, dataEnvironment);
      case 'community/get':
        return await community.communityGet(openid, data);
      case 'community/my':
        return await community.communityMy(openid, data);
      case 'community/createUploadSession':
        return await community.communityCreateUploadSession(openid, data);
      case 'community/create':
        return await community.communityCreate(openid, data, dataEnvironment);
      case 'community/toggleLike':
        return await community.communityToggleLike(openid, data);
      case 'community/likeList':
        return await community.communityLikeList(openid, data);
      case 'community/interactions':
        return await community.communityInteractions(openid, data);
      case 'community/notifications':
        return await community.communityNotifications(openid, data);
      case 'community/notificationsMarkRead':
        return await community.communityNotificationsMarkRead(openid);
      case 'community/commentList':
        return await community.communityCommentList(openid, data);
      case 'community/replyList':
        return await community.communityReplyList(openid, data);
      case 'community/commentCreate':
        return await community.communityCommentCreate(openid, data);
      case 'community/commentDelete':
        return await community.communityCommentDelete(openid, data);
      case 'community/delete':
        return await community.communityDelete(openid, data);

      // ========== 后台社区审核 ==========
      case 'admin/communityReviewList':
        return await adminCommunity.adminCommunityReviewList(data);
      case 'admin/communityReviewUpdate':
        return await adminCommunity.adminCommunityReviewUpdate(data);
      case 'admin/officialAccountList':
        return await adminOfficialCommunity.adminOfficialAccountList(data);
      case 'admin/officialAccountSave':
        return await adminOfficialCommunity.adminOfficialAccountSave(data);
      case 'admin/officialUploadSession':
        return await adminOfficialCommunity.adminOfficialUploadSession(data);
      case 'admin/officialPostList':
        return await adminOfficialCommunity.adminOfficialPostList(data);
      case 'admin/officialPostCreate':
        return await adminOfficialCommunity.adminOfficialPostCreate(data);
      case 'admin/officialPostUpdate':
        return await adminOfficialCommunity.adminOfficialPostUpdate(data);
      case 'admin/tripReviewList':
        return await adminTrip.adminTripReviewList(data);
      case 'admin/tripReviewUpdate':
        return await adminTrip.adminTripReviewUpdate(data);
      case 'admin/tripLogReviewList':
        return await adminTripLog.adminTripLogReviewList(data);
      case 'admin/tripLogReviewUpdate':
        return await adminTripLog.adminTripLogReviewUpdate(data);
      case 'admin/reportList':
        return await adminReport.adminReportList(data);
      case 'admin/reportUpdate':
        return await adminReport.adminReportUpdate(data);
      case 'admin/dataList':
        return await adminData.adminDataList(data);
      case 'admin/login':
        return await adminData.adminLogin(data);
      case 'admin/register':
        return await adminData.adminRegister(data);
      case 'admin/dataGet':
        return await adminData.adminDataGet(data);
      case 'admin/dataCreate':
        return await adminData.adminDataCreate(data);
      case 'admin/dataUpdate':
        return await adminData.adminDataUpdate(data);
      case 'admin/dataDelete':
        return await adminData.adminDataDelete(data);
      case 'admin/dataBatchCreate':
        return await adminData.adminDataBatchCreate(data);
      case 'admin/spotPublish':
        return await adminData.adminSpotPublish(data);
      case 'admin/tripListVisibilityGet':
        return await adminSystemConfig.adminTripListVisibilityGet(data);
      case 'admin/tripListVisibilityUpdate':
        return await adminSystemConfig.adminTripListVisibilityUpdate(data);

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (err) {
    console.error('云函数错误:', err);
    return { success: false, error: err.message };
  }
};
