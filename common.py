#!/usr/bin/env python
# -*- coding:utf-8 -*-

import logging
import os
from datetime import datetime, timedelta
from random import getrandbits

import jinja2
import webapp2

from google.appengine.ext import db

jinja_environment = jinja2.Environment(
    autoescape=True,
    loader=jinja2.FileSystemLoader(os.path.dirname(__file__)))

class Account(db.Model):
    session_id = db.StringProperty(indexed=False)
    session_token = db.StringProperty(indexed=False)
    last_login = db.DateTimeProperty()
    imakoko_user = db.StringProperty(indexed=False)
    imakoko_secret = db.StringProperty(indexed=False)
    twitter_user = db.StringProperty(indexed=False)
    twitter_token = db.StringProperty(indexed=False)
    twitter_secret = db.StringProperty(indexed=False)

class BasePage(webapp2.RequestHandler):
    def get_sid_str(self):
        return self.request.cookies.get('IMAKOKO_SID', '')

    def get_account(self):
        sid_str = self.get_sid_str()
        if not sid_str:
            return None
        id_pair = sid_str.split('_', 1)
        if len(id_pair) != 2 or not id_pair[0].isdigit():
            return None
        account = Account.get_by_id(long(id_pair[0]))
        if account and account.session_id == id_pair[1]:
            return account
        return None

    def put_with_new_sid(self, account):
        account.session_id = os.urandom(16).encode('hex')
        account.session_token = '%016x' % getrandbits(64)
        account.last_login = datetime.utcnow()
        account.put()
        self.set_sid_cookie(account)

    def set_sid_cookie(self, account):
        sid_str = '%d_%s' % (account.key().id(), account.session_id)
        self.response.set_cookie('IMAKOKO_SID', sid_str, max_age=timedelta(90), httponly=True)

    def create_temporary_sid(self):
        sid_str = '_%032x' % getrandbits(128)
        self.response.set_cookie('IMAKOKO_SID', sid_str, max_age=timedelta(hours=1), httponly=True)
        return sid_str

    def show_html(self, html_file, template_values={}):
        template = jinja_environment.get_template(html_file)
        self.response.headers['Content-Type'] = 'text/html; charset=UTF-8'
        self.response.write(template.render(template_values))

    def show_error_page(self):
        self.error(500)
        self.show_html('error.html')

    def handle_exception(self, exception, debug_mode):
        logging.exception(exception)
        self.show_error_page()
