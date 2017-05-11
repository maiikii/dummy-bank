const express = require('express');
const bodyparser = require('body-parser');
const cookieparser = require('cookie-parser');
const session = require('express-session');
const flash = require('express-flash');
const consolidate = require('consolidate');
const passport = require('./config/passport');
const database = require('./database');
const User = require('./models').User;
const Account = require('./models').Account;

const app = express();

app.engine('html', consolidate.nunjucks);
app.set('views', './views');

app.use(bodyparser.urlencoded({ extended: false }))
app.use(cookieparser('secret-cookie'));
app.use(session({ resave: false, saveUninitialized: false, secret: 'secret-cookie' }));
app.use(flash());
app.use(passport.initialize());

app.use('/static', express.static('./static'));
app.use(require('./routes/auth'));

app.get('/', function(req, res) {
	res.render('index.html');
});

app.get('/profile', requireSignedIn, function(req, res) {
	const email = req.session.currentUser;
	User.findOne({ where: { email: email } }).then(function(user) {
		res.render('profile.html', {
			user: user
		});
	});
});

app.post('/transfer', requireSignedIn, function(req, res) {
	const recipient = req.body.recipient;
	const amount = parseInt(req.body.amount, 10);
	const email = req.session.currentUser;

	var query1 = "SELECT user_id, balance FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email = " + "'" + email + "')";
	var query2 = "SELECT user_id, balance FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email = " + "'" + recipient + "')";

	database.query(query1, { model: Account }).then(function(sender) {
		database.query(query2, { model: Account }).then(function(receiver) {
			sender.balance = sender.map(function(sender){ return sender.balance });
			sender.user_id = sender.map(function(sender){ return sender.user_id });
			receiver.balance = receiver.map(function(receiver){ return receiver.balance });
			receiver.user_id = receiver.map(function(receiver){ return receiver.user_id });

			sender.balance = parseInt(sender.balance, 10);
			receiver.balance = parseInt(receiver.balance, 10);
			
			database.transaction(function(t) {
				return Account.update( {
					balance: sender.balance - amount
				}, { where: { user_id: sender.user_id }
				}, { transaction: t }
				).then(function() {
					return Account.update( {
						balance: receiver.balance + amount
					}, { where: { user_id: receiver.user_id }
					}, { transaction: t });
				});
			}).then(function() {
				req.flash('statusMessage', 'Transferred ' + amount + ' to ' + recipient);
				res.redirect('/profile');
			});
		});
	});
});

app.post('/deposit', requireSignedIn, function(req, res) {
	const amount = parseInt(req.body.amount, 10);

	const email = req.session.currentUser;
	User.findOne({ where: { email: email } }).then(function(user) {
		Account.findOne({ where: { user_id: user.id } }).then(function(userAccount) {
			if(userAccount != null) {
				database.transaction(function(t) {
					return userAccount.update({
						balance: userAccount.balance + amount
					});
				});
			}else {
				Account.create({
					balance: amount,
					user_id: user.id
				})
			}
		}).then(function() {
			req.flash('statusMessage', 'Deposited ' + amount);
			res.redirect('/profile');
		});
	});
});

app.post('/withdraw', requireSignedIn, function(req, res) {
	const amount = parseInt(req.body.amount, 10);

	const email = req.session.currentUser;
	User.findOne({ where: { email: email } }).then(function(user) {
		Account.findOne({ where: { user_id: user.id } }).then(function(userAccount) {
			if(userAccount != null) {
				database.transaction(function(t) {
					return userAccount.update({
						balance: userAccount.balance - amount
					});
				}).then(function() {
					req.flash('statusMessage', 'Withdrawed ' + amount);
					res.redirect('/profile');
				});
			}else {
				req.flash('statusMessage', 'Insufficient amount in account');
				res.redirect('/profile');
			}
		});
	});
});

app.get('/auth/twitter', passport.authenticate('twitter'));
app.get('/auth/twitter/callback',
    passport.authenticate('twitter', {
        failureRedirect: '/'
    }),
    function(req, res) {
        req.session.currentUser = req.user.email;
        res.redirect('/profile');
    }
);

function requireSignedIn(req, res, next) {
    if (!req.session.currentUser) {
        return res.redirect('/');
    }
    next();
}

app.listen(3000, function() {
	console.log('Server is now running at port 3000');
});
