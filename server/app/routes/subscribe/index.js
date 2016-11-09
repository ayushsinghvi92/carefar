var db = require('../../../db');
var Subscriber = db.model('subscriber');
var router = require('express').Router(); // eslint-disable-line new-cap
module.exports = router;

router.get(function (req,res,next) {
	res.send(200)
})