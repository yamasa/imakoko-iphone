#!/usr/bin/env python
# -*- coding:utf-8 -*-

import logging
from base64 import b64encode
from datetime import datetime, timedelta
from random import getrandbits
from urllib import quote

import webapp2
import common

from google.appengine.api import memcache, urlfetch

IMAKOKO_LATEST_URL = 'http://imakoko-gps.appspot.com/api/latest?user=all'
IMAKOKO_GETUSERINFO_URL = 'http://imakoko-gps.appspot.com/api/getuserinfo?user='
IMAKOKO_USER_URL = 'https://imakoko-gps.appspot.com/user'
IMAKOKO_POST_URL = 'http://imakoko-gps.appspot.com/api/post'

LATEST_INTERVAL = timedelta(seconds=10)
local_cache = (datetime.min, '')

class ApiLatestPage(webapp2.RequestHandler):
    def get(self):
        global local_cache
        now = datetime.utcnow()
        if now < local_cache[0]:
            self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
            self.response.write(local_cache[1])
            return

        mclient = memcache.Client()
        lock_and_cache = mclient.get_multi(['LATEST_LOCK', 'LATEST_CACHE'], for_cas=True)
        lock = lock_and_cache.get('LATEST_LOCK')
        cache = lock_and_cache.get('LATEST_CACHE')
        if lock is None:
            next_timestamp = now + LATEST_INTERVAL
            should_fetch = mclient.add('LATEST_LOCK', next_timestamp)
        elif lock <= now:
            next_timestamp = lock + LATEST_INTERVAL
            if next_timestamp <= now:
                next_timestamp = now + LATEST_INTERVAL
            should_fetch = mclient.cas('LATEST_LOCK', next_timestamp)
        else:
            should_fetch = False

        if should_fetch:
            fetch_result = urlfetch.fetch(IMAKOKO_LATEST_URL)
            if fetch_result.status_code == 200:
                cache = (next_timestamp, fetch_result.content)
                mclient.set('LATEST_CACHE', cache)

        if cache is not None and local_cache[0] < cache[0]:
            local_cache = cache
        else:
            cache = local_cache
        self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
        if cache[0] < now - timedelta(minutes=5):
            self.response.write('({"points":[],"result":1})')
        else:
            self.response.write(cache[1])


class ApiGetuserinfoPage(webapp2.RequestHandler):
    def get(self):
        user = self.request.get('user')
        if not user:
            self.error(400)
            return
        cached = memcache.get('USERINFO_' + user)
        if cached:
            self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
            self.response.write(cached)
            return

        result = urlfetch.fetch(IMAKOKO_GETUSERINFO_URL + quote(user, safe='~'))
        if result.status_code == 200:
            memcache.set('USERINFO_' + user, result.content, 300)
            self.response.headers['Content-Type'] = 'text/javascript; charset=UTF-8'
            self.response.write(result.content)
        else:
            self.response.status_int = result.status_code


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
            sid_str = self.get_sid_str()
        else:
            sid_str = self.create_temporary_sid()
        token = '%016x' % getrandbits(64)
        memcache.set('ACCOUNT_' + sid_str, token, 3600)
        self.show_html('account.html', {'user': account and account.imakoko_user, 'token': token})

    def post(self):
        sid_str = self.get_sid_str()
        token = memcache.get('ACCOUNT_' + sid_str)
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

        memcache.delete('ACCOUNT_' + sid_str)

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
            memcache.delete('IMAKOKO_' + sid_str + account.session_token)
        self.redirect('/settings.html')


class ApiPostPage(common.BasePage):
    def post(self):
        sid_str = self.get_sid_str()
        token = self.request.headers.get('X-Imakoko-Token', '')

        auth_str = memcache.get('IMAKOKO_' + sid_str + token)
        if not auth_str:
            account = self.get_account()
            if not account or not account.imakoko_user:
                logging.debug('Not Logged in.')
                self.error(400)
                return
            if account.session_token != token:
                logging.warning('(%d) session_token mismatch.', account.key().id())
                self.error(500)
                return
            logging.debug('(%d) Imakoko: %s', account.key().id(), account.imakoko_user)
            auth_str = 'Basic ' + account.imakoko_secret
            memcache.set('IMAKOKO_' + sid_str + token, auth_str, 3600)

        data = self.request.body
        headers = {'Authorization': auth_str}
        result = urlfetch.fetch(IMAKOKO_POST_URL, data, urlfetch.POST, headers)

        status_code = result.status_code
        if status_code == 401:
            memcache.delete('IMAKOKO_' + sid_str + token)
            self.error(400)
            return
        if status_code == 503:
            status_code = 200
        self.response.status_int = status_code


app = webapp2.WSGIApplication(
    [('/api/latest', ApiLatestPage),
     ('/api/getuserinfo', ApiGetuserinfoPage),
     ('/imakoko.html', MainPage),
     ('/settings.html', SettingPage),
     ('/account.html', AccountPage),
     ('/api/post', ApiPostPage)])
