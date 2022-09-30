const bcrypt = require('bcrypt');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const UserGoogle = require('../models/UserGoogle');
const queryString = require('query-string');
const UserGithub = require('../models/UserGithub');
const UserFacebook = require('../models/UserFacebook');
const useragent = require('useragent');
const WebServiceClient = require('@maxmind/geoip2-node').WebServiceClient;

const AuthenController = {
  setCookie: (res, refreshToken) => {
    res.cookie('refreshToken', refreshToken, {
      // Since localhost is not having https protocol,
      // secure cookies do not work correctly (in postman)
      //SameSite is set to "None" since client and server will be in different domains.
      httpOnly: true,
      secure: true,
      path: '/',
      sameSite: 'none',
      maxAge: 60000 * 60 * 24 * 365,
    });
  },

  genarateAccessToken: (user) => {
    return jwt.sign(
      {
        _id: user._id, // id is String
        admin: user.admin,
        provider: user.provider,
      },
      process.env.JWT_ACCESS_KEY,
      { expiresIn: '30s' },
    );
  },

  genarateRefreshToken: (user) => {
    return jwt.sign(
      {
        _id: user._id,
        admin: user.admin,
        provider: user.provider,
      },
      process.env.JWT_ACCESS_KEY,
      { expiresIn: '30d' },
    );
  },

  register: async (req, res) => {
    try {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(req.body.password, salt);

      const newUser = new User({
        fullname: req.body.fullname,
        email: req.body.email,
        username: req.body.username,
        password: hashed,
      });

      const user = await newUser.save();
      const { username } = user._doc;

      res.status(200).json(username);
    } catch (err) {
      res.status(500).json(err);
    }
  },

  loginSuccess: async (req, res, user) => {
    try {
      const accessToken = AuthenController.genarateAccessToken(user);
      const refreshToken = AuthenController.genarateRefreshToken(user);

      console.log(req.headers['x-forwarded-for'] || req.connection.remoteAddress);
      const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

      const geoip2 = new WebServiceClient(process.env.GEOIP2_ACCOUNT_ID, process.env.GEOIP2_LICENSE_KEY, {
        host: 'geolite.info',
      });

      const cityRes = await geoip2.city(clientIp);
      console.log('cityRes: ', cityRes);

      const agent = useragent.parse(req.headers['user-agent']);

      const newToken = new RefreshToken({
        userId: user._id,
        refreshToken: refreshToken,
        agent: agent.toAgent(),
        os: agent.os.toString(),
        device: agent.device.toString(),
        location: cityRes.city.names.en + ', ' + cityRes.country.names.en,
      });

      await newToken.save();
      AuthenController.setCookie(res, refreshToken);

      return accessToken;
    } catch (err) {
      console.log(err);
      return false;
    }
  },

  loginLocal: async (req, res) => {
    try {
      const user = await User.findOne({ username: req.body.username });

      if (!user)
        return res.status(404).json({
          key: 'username',
          mess: 'Username is not exist',
        });

      const match = await bcrypt.compare(req.body.password, user.password);

      if (match) {
        const accessToken = await AuthenController.loginSuccess(req, res, user);
        const { password, ...other } = user._doc;

        res.status(200).json({
          accessToken,
          ...other,
        });
      } else {
        res.status(404).json({
          key: 'password',
          mess: 'Incorrect password',
        });
      }
    } catch (err) {
      res.status(500).json(err);
    }
  },

  loginGoogle: async (req, res) => {
    try {
      let userGoogle = await UserGoogle.findOne({ googleId: req.body.googleId });

      if (!userGoogle) {
        const newUserGoogle = new UserGoogle({
          fullname: req.body.fullname,
          avatar: req.body.avatar,
          googleId: req.body.googleId,
          email: req.body.email,
        });

        userGoogle = await newUserGoogle.save();
      }

      const accessToken = await AuthenController.loginSuccess(req, res, userGoogle);
      if (accessToken)
        return res.status(200).json({
          ...userGoogle._doc,
          accessToken,
        });

      res.status(500).json({
        error: true,
        mess: 'Login Failed',
      });
    } catch (err) {
      res.status(500).json(err.toString());
    }
  },

  loginGithub: async (req, res) => {
    try {
      let userGithub = await UserGithub.findOne({ githubId: req.body.githubId });

      if (!userGithub) {
        const newUserGoogle = new UserGithub({
          fullname: req.body.fullname,
          username: req.body.username,
          avatar: req.body.avatar,
          githubId: req.body.githubId,
          email: req.body.email,
        });

        userGithub = await newUserGoogle.save();
      }

      const accessToken = await AuthenController.loginSuccess(req, res, userGithub);

      res.status(200).json({
        ...userGithub._doc,
        accessToken,
      });
    } catch (err) {
      res.status(500).json(err.toString());
    }
  },

  loginFacebook: async (req, res) => {
    try {
      let userFacebook = await UserFacebook.findOne({ facebookId: req.body.facebookId });

      if (!userFacebook) {
        const newUserGoogle = new UserFacebook({
          fullname: req.body.fullname,
          avatar: req.body.avatar,
          facebookId: req.body.facebookId,
          email: req.body.email,
        });

        userFacebook = await newUserGoogle.save();
      }

      const accessToken = await AuthenController.loginSuccess(req, res, userFacebook);

      res.status(200).json({
        ...userFacebook._doc,
        accessToken,
      });
    } catch (err) {
      res.status(500).json(err.toString());
    }
  },

  requestRefreshToken: async (req, res) => {
    const refreshTokenRequest = req.cookies.refreshToken;

    if (!refreshTokenRequest) return res.status(401).json("You're not authenticated");

    const match = await RefreshToken.findOne({ refreshToken: refreshTokenRequest });

    if (!match) return res.status(401).json("You're not authenticated");

    jwt.verify(refreshTokenRequest, process.env.JWT_ACCESS_KEY, async (err, user) => {
      if (err) {
        await RefreshToken.deleteOne({ refreshToken: refreshTokenRequest });
        return res.status(403).json('Refresh token is not valid');
      }

      const newAccessToken = AuthenController.genarateAccessToken(user);
      const newRefreshToken = AuthenController.genarateRefreshToken(user);

      await RefreshToken.updateOne(
        { refreshToken: refreshTokenRequest },
        {
          refreshToken: newRefreshToken,
        },
      );

      AuthenController.setCookie(res, newRefreshToken);

      res.status(200).json({ accessToken: newAccessToken });
    });
  },

  logout: async (req, res) => {
    try {
      const refreshTokenRequest = req.cookies.refreshToken;
      if (!refreshTokenRequest) return res.status(401).json("You're not authenticated");
      await RefreshToken.deleteOne({ refreshToken: refreshTokenRequest });

      AuthenController.setCookie(res, '');
      res.clearCookie('refreshToken');

      res.status(200).json('Logout Successfully');
    } catch (err) {
      res.status(500).json('Logout Failed');
    }
  },

  githubCallback: async (req, res) => {
    try {
      const code = req.query.code;
      const payload = {
        code,
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
      };

      const accessTokenRes = await axios.post(
        'https://github.com/login/oauth/access_token?' + queryString.stringify(payload),
        {},
        {
          headers: {
            accept: 'application/json',
          },
        },
      );

      const { access_token } = accessTokenRes.data;
      const userGithubRes = await axios.get('https://api.github.com/user', {
        headers: {
          accept: 'application/json',
          Authorization: 'Bearer ' + access_token,
        },
      });

      const userGithub = userGithubRes.data;

      const user = {
        username: userGithub.login,
        githubId: userGithub.id,
        // avatar: userGithub.avatar_url,
        email: userGithub.email || '',
      };

      res.redirect(
        process.env.CLIENT_URL + '/load?avatar=' + userGithub.avatar_url + '&' + queryString.stringify(user),
      );
    } catch (err) {
      console.log(err);
      res.send(err);
    }
  },
};

module.exports = AuthenController;
