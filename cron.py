#!/usr/bin/env python
# -*- coding:utf-8 -*-

import logging
from datetime import datetime, timedelta

from common import Account

from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app


class CleanAccountsPage(webapp.RequestHandler):
    def get(self):
        for account in Account.all().filter('last_login <', datetime.utcnow() - timedelta(91)):
            logging.info('(%d) Expired: imakoko="%s", twitter="%s"', account.key().id(), account.imakoko_user, account.twitter_user)
            account.delete()


application = webapp.WSGIApplication(
    [('/cron/cleanAccounts', CleanAccountsPage)])

def main():
    run_wsgi_app(application)

if __name__ == '__main__':
    main()
