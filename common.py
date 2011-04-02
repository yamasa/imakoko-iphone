#!/usr/bin/env python
# -*- coding:utf-8 -*-

import logging
from datetime import datetime, timedelta
from random import getrandbits
from os import urandom

from google.appengine.dist import use_library
use_library('django', '1.2')

from google.appengine.ext import db, webapp
from google.appengine.ext.webapp import template

class Account(db.Model):
    session_id = db.StringProperty()
    session_token = db.StringProperty()
    last_login = db.DateTimeProperty()
    imakoko_user = db.StringProperty()
    imakoko_secret = db.StringProperty()
    twitter_user = db.StringProperty()
    twitter_token = db.StringProperty()
    twitter_secret = db.StringProperty()

class BasePage(webapp.RequestHandler):
    def get_account(self):
        session_id = self.request.cookies.get(u'IMAKOKO_SID')
        if session_id:
            return Account.all().filter('session_id =', session_id).get()
        else:
            return None

    def put_with_new_sid(self, account):
        account.session_token = '%016x' % getrandbits(64)
        account.last_login = datetime.utcnow()
        while True:
            session_id = urandom(16).encode('hex')
            account.session_id = session_id
            account.put()
            try:
                if Account.all().filter('session_id =', session_id).count() == 1:
                    break
                logging.warning('(%d) Conflicted IMAKOKO_SID "%s".', account.key().id(), session_id)
            except:
                logging.exception('(%d) Check error: IMAKOKO_SID "%s".', account.key().id(), session_id)
        self.set_sid_cookie(account)

    def set_sid_cookie(self, account):
        expires = account.last_login + timedelta(90)
        self.response.headers.add_header(
            'Set-Cookie',
            'IMAKOKO_SID=' + str(account.session_id) + '; expires=' + expires.strftime('%a, %d-%b-%Y %H:%M:%S GMT') + '; path=/; httponly')

    def create_temporary_sid(self):
        session_id = 'x%031x' % getrandbits(124)
        expires = datetime.utcnow() + timedelta(hours=1)
        self.response.headers.add_header(
            'Set-Cookie',
            'IMAKOKO_SID=' + session_id + '; expires=' + expires.strftime('%a, %d-%b-%Y %H:%M:%S GMT') + '; path=/; httponly')
        return session_id

    def show_html(self, html_file, template_values={}):
        self.response.headers['Content-Type'] = 'text/html; charset=UTF-8'
        self.response.out.write(template.render(html_file, template_values))

    def show_error_page(self):
        self.error(500)
        self.show_html('error.html')

    def handle_exception(self, exception, debug_mode):
        logging.exception(exception)
        self.show_error_page()
