'use strict';
var crypto = require('crypto');
var _ = require('lodash');
var Sequelize = require('sequelize');

var db = require('../_db');

module.exports = db.define('subscriber', {
	email: {
		type: Sequelize.STRING
	}
})
