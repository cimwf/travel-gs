# Vendor Dependencies

This directory contains third-party JavaScript libraries used by the miniprogram.

## cos-wx-sdk-v5

- **Package**: cos-wx-sdk-v5
- **Version**: 1.8.0
- **Source**: https://github.com/tencentyun/cos-wx-sdk-v5
- **npm package**: https://www.npmjs.com/package/cos-wx-sdk-v5/v/1.8.0
- **Vendored file**: `cos-wx-sdk-v5.min.js`
- **SHA-256**: `103f5adecb13b57a9d56a4e45e3c3335ff0075b964eb373fcfef26838c1600bc`

The official minified distribution is committed with the mini program so
developers do not need to run a separate npm build in WeChat DevTools.
The upstream license is stored in `cos-wx-sdk-v5.LICENSE`.

### Note

Image upload still requires `COS_SECRET_ID` and `COS_SECRET_KEY` to be
configured in the cloud function environment. These permanent credentials
must never be added to the mini program or this directory.

When COS is not configured, image upload will show a clear error message to the user.
