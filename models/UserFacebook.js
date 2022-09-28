const mongoose = require('mongoose');

const userFacebookSchema = new mongoose.Schema(
  {
    facebookId: {
      type: String,
      required: true,
    },
    fullname: {
      type: String,
      default: '',
    },
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
    },
    admin: {
      type: Boolean,
      default: false,
    },
    verify: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      default: 'facebook',
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('UserFacebook', userFacebookSchema);