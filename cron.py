#!/usr/bin/env python
# -*- coding:utf-8 -*-

import logging
from datetime import datetime, timedelta

import webapp2
from common import Account

class CleanAccountsPage(webapp2.RequestHandler):
    def get(self):
        for account in Account.all().filter('last_login <', datetime.utcnow() - timedelta(91)):
            logging.info('(%d) Expired: imakoko="%s", twitter="%s"', account.key().id(), account.imakoko_user, account.twitter_user)
            account.delete()


app = webapp2.WSGIApplication(
    [('/cron/cleanAccounts', CleanAccountsPage)])
