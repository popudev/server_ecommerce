const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const UserFacebook = require('../models/UserFacebook');
const UserGithub = require('../models/UserGithub');
const UserGoogle = require('../models/UserGoogle');

const UserController = {
  getUser: async (req, res) => {
    try {
      let user = {};

      switch (req.user.provider) {
        case 'github':
          user = await UserGithub.findOne({ _id: req.user._id });
          break;
        case 'google':
          user = await UserGoogle.findOne({ _id: req.user._id });
          break;
        case 'facebook':
          user = await UserFacebook.findOne({ _id: req.user._id });
          break;
        default:
          user = await User.findOne({ _id: req.user._id });
      }

      const { password, ...other } = user._doc;
      res.status(200).json(other);
    } catch (err) {
      res.status(500).json(err);
      console.log('err: ', err);
    }
  },

  getUserByEmailOrPhone: async (req, res) => {
    try {
      let user = await User.findOne({
        $or: [{ email: req.query.search }, { phone: req.query.search }],
      });

      if (!user)
        return res.status(400).json({
          error: true,
          mess: 'Account not found',
        });

      const result = {
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        username: user.username,
      };
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json(err);
      console.log('err: ', err);
    }
  },

  getAllUsers: async (req, res) => {
    try {
      const users = await User.find();

      res.status(200).json(users);
    } catch (err) {
      res.status(500).json(err);
    }
  },

  updateUser: async (req, res) => {
    try {
      let userUpdated = null;

      switch (req.user.provider) {
        case 'github':
          userUpdated = await UserGithub.findOneAndUpdate(
            { _id: req.user._id },
            req.body,
          );
          break;

        case 'google':
          userUpdated = await UserGoogle.findOneAndUpdate(
            { _id: req.user._id },
            req.body,
          );
          break;

        case 'facebook':
          userUpdated = await UserFacebook.findOneAndUpdate(
            { _id: req.user._id },
            req.body,
          );
          break;

        default:
          const emailAccount = await User.findOne({
            _id: { $ne: req.user._id },
            email: req.body.email,
          });

          if (emailAccount)
            return res.status(400).json({
              error: true,
              key: 'email',
              mess: 'Email is exist',
            });

          const user = await User.findOne({ _id: req.user._id });

          if (user.email !== req.body.email) {
            req.body.verify = false;
          }

          userUpdated = await User.findOneAndUpdate(
            { _id: req.user._id },
            req.body,
          );
      }

      const { password, ...other } = userUpdated._doc;

      const userRes = {
        ...other,
        ...req.body,
      };

      if (userUpdated) res.status(200).json(userRes);
      else res.status(400).json({ error: true, mess: 'Not found user' });
    } catch (err) {
      res.status(500).json(err.toString());
    }
  },

  deleteUser: async (req, res) => {
    try {
      const result = await User.find({ _id: req.params.id });

      if (result) {
        res.status(200).json('Delete successfully');
      } else {
        res.status(400).json({
          error: true,
          mess: 'Not Found User !!!',
        });
      }
    } catch (err) {
      res.status(500).json(err);
    }
  },

  changePassword: async (req, res) => {
    try {
      const user = await User.findOne({ _id: req.user._id });

      const match = await bcrypt.compare(
        req.body.currentPassword,
        user.password,
      );

      if (!match)
        return res.status(400).json({
          error: true,
          key: 'currentPassword',
          mess: 'Current Password Invalid',
        });

      const matchCurrentPassword = await bcrypt.compare(
        req.body.newPassword,
        user.password,
      );

      if (matchCurrentPassword)
        return res.status(400).json({
          error: true,
          key: 'newPassword',
          mess: 'New Password Match Current Password',
        });

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(req.body.newPassword, salt);

      await User.updateOne({ _id: req.user._id }, { password: hashed });

      res.status(200).json('Update Password Successfully');
    } catch (err) {
      console.log('err: ', err);
      res.status(500).json(err.toString());
    }
  },
};

module.exports = UserController;
