#!/usr/bin/env python
# -*- coding:utf-8 -*-

import logging
from base64 import b64encode
from datetime import datetime, timedelta
from random import getrandbits
from urllib import quote

import common

from google.appengine.api import memcache, urlfetch
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app

IMAKOKO_LATEST_URL = 'http://imakoko-gps.appspot.com/api/latest?user=all'
IMAKOKO_GETUSERINFO_URL = 'http://imakoko-gps.appspot.com/api/getuserinfo?user='
IMAKOKO_USER_URL = 'https://imakoko-gps.appspot.com/user'
IMAKOKO_POST_URL = 'http://imakoko-gps.appspot.com/api/post'


class ApiLatestPage(webapp.RequestHandler):
    def get(self):
        cached = memcache.get('LATEST')
        if cached:
            self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
            self.response.out.write(cached)
            return

        result = urlfetch.fetch(IMAKOKO_LATEST_URL)
        if result.status_code == 200:
            memcache.set('LATEST', result.content, 10)
            self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
            self.response.out.write(result.content)
        else:
            self.response.set_status(result.status_code)


class ApiGetuserinfoPage(webapp.RequestHandler):
    def get(self):
        user = str(self.request.get('user'))
        if not user:
            self.error(400)
            return
        cached = memcache.get('USERINFO_' + user)
        if cached:
            self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
            self.response.out.write(cached)
            return

        result = urlfetch.fetch(IMAKOKO_GETUSERINFO_URL + quote(user, safe='~'))
        if result.status_code == 200:
            memcache.set('USERINFO_' + user, result.content, 300)
            self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
            self.response.out.write(result.content)
        else:
            self.response.set_status(result.status_code)


class MainPage(common.BasePage):
    def get(self):
        account = self.get_account()
        if account:
            now = datetime.utcnow()
            if account.last_login < now - timedelta(hours=1):
                logging.debug('(%d) Login: imakoko="%s", twitter="%s"',
                              account.key().id(), account.imakoko_user, account.twitter_user)
                account.last_login = now
                self.set_sid_cookie(account)
                try:
                    account.put()
                except:
                    pass
        self.show_html('imakoko.html', {'account': account})


class SettingPage(common.BasePage):
    def get(self):
        account = self.get_account()
        self.show_html('settings.html', {'account': account})


class AccountPage(common.BasePage):
    def get(self):
        account = self.get_account()
        if account:
            session_id = str(account.session_id)
        else:
            session_id = self.create_temporary_sid()
        token = '%016x' % getrandbits(64)
        memcache.set('ACCOUNT_' + session_id, token, 3600)
        self.show_html('account.html', {'user': account and account.imakoko_user, 'token': token})

    def post(self):
        session_id = str(self.request.cookies.get(u'IMAKOKO_SID'))
        token = memcache.get('ACCOUNT_' + session_id)
        if not token or token != self.request.get('token'):
            logging.warning('Token mismatch.')
            self.show_error_page()
            return

        user = self.request.get('user')
        if user:
            secret = b64encode((user + u':' + self.request.get('passwd')).encode('utf-8'))
            status = urlfetch.fetch(IMAKOKO_USER_URL, headers={'Authorization': 'Basic ' + secret}).status_code
            if status == 401:
                logging.debug('Login failed.')
                self.show_html('account.html', {'user': user, 'token': token, 'error': True})
                return
            elif status != 200:
                logging.error('Login error. (%d)', status)
                self.show_error_page()
                return

        memcache.delete('ACCOUNT_' + session_id)

        account = self.get_account()
        if not account:
            account = common.Account()

        if user:
            account.imakoko_user = user
            account.imakoko_secret = secret
            self.put_with_new_sid(account)
            logging.info('(%d) Join: imakoko="%s"', account.key().id(), account.imakoko_user)
        elif account.imakoko_user:
            logging.info('(%d) Leave: imakoko="%s"', account.key().id(), account.imakoko_user)
            account.imakoko_user = None
            account.imakoko_secret = None
            account.put()
            memcache.delete('IMAKOKO_' + account.session_id + account.session_token)
        self.redirect('/settings.html')


class ApiPostPage(common.BasePage):
    def post(self):
        session_id = str(self.request.cookies.get(u'IMAKOKO_SID'))
        session_token = str(self.request.headers.get('X-Imakoko-Token'))

        auth_str = memcache.get('IMAKOKO_' + session_id + session_token)
        if not auth_str:
            account = self.get_account()
            if not account or not account.imakoko_user:
                logging.debug('Not Logged in.')
                self.error(400)
                return
            if account.session_token != session_token:
                logging.warning('(%d) session_token mismatch.', account.key().id())
                self.error(500)
                return
            logging.debug('(%d) Imakoko: %s', account.key().id(), account.imakoko_user)
            auth_str = 'Basic ' + str(account.imakoko_secret)
            memcache.set('IMAKOKO_' + session_id + session_token, auth_str, 3600)

        data = self.request.body
        headers = {'Authorization': auth_str}
        result = urlfetch.fetch(IMAKOKO_POST_URL, data, urlfetch.POST, headers)

        status_code = result.status_code
        if status_code == 401:
            memcache.delete('IMAKOKO_' + session_id + session_token)
            self.error(400)
            return

        self.response.set_status(status_code)
#        content_type = result.headers.get('Content-Type')
#        if content_type:
#            self.response.headers['Content-Type'] = content_type
#        self.response.out.write(result.content)


application = webapp.WSGIApplication(
    [('/api/latest', ApiLatestPage),
     ('/api/getuserinfo', ApiGetuserinfoPage),
     ('/imakoko.html', MainPage),
     ('/settings.html', SettingPage),
     ('/account.html', AccountPage),
     ('/api/post', ApiPostPage)])

def main():
    run_wsgi_app(application)

if __name__ == '__main__':
    main()
