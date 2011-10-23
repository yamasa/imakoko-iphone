#!/usr/bin/env python
# -*- coding:utf-8 -*-

import logging
import cgi
import re

import webapp2
import common
from oauthclient import TwitterClient, escape

from google.appengine.api import app_identity, memcache, urlfetch

# Twitter OAuth Consumer Key.
CONSUMER_KEY = 'XXXXXXXXXXXXXXXXXXXXX'
CONSUMER_SECRET = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
# bit.ly API Key.
BITLY_USERNAME = 'XXXXX'
BITLY_APIKEY = 'R_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'


TWITTER_POST_URL = 'http://api.twitter.com/1/statuses/update.json'

oauth_client = TwitterClient(CONSUMER_KEY, CONSUMER_SECRET)

shorten_url_pattern = re.compile(re.escape('http://' + app_identity.get_default_version_hostname() + '/m/') + '[\w!%\'()*.~-]*(#\w+)?')

def shorten_url(matchobj):
    url = matchobj.group()
    result = urlfetch.fetch('http://api.bit.ly/v3/shorten?login=' + BITLY_USERNAME + '&apiKey=' + BITLY_APIKEY + '&format=txt&domain=j.mp&longUrl=' + escape(url))
    if result.status_code != 200:
        logging.error('Cannot shorten URL. (%d %s)\n%s', result.status_code, result.content, url)
        raise Exception
    return result.content.rstrip()


class TwitterOAuthPage(common.BasePage):
    def get(self):
        account = self.get_account()
        if account:
            sid_str = self.get_sid_str()
        else:
            sid_str = self.create_temporary_sid()
        callback_url = self.request.relative_url('callback')
        reqtoken_result = oauth_client.obtain_request_token(callback_url)
        memcache.set('TWITTER_OAUTH_' + sid_str, reqtoken_result, 3600)
        self.redirect(reqtoken_result['authorization_url'])


class TwitterCallbackPage(common.BasePage):
    def get(self):
        sid_str = self.get_sid_str()
        reqtoken_result = memcache.get('TWITTER_OAUTH_' + sid_str)
        if not reqtoken_result:
            logging.warning('No reqtoken_result.')
            self.show_error_page()
            return
        memcache.delete('TWITTER_OAUTH_' + sid_str)

        account = self.get_account()
        if not account:
            account = common.Account()

        if reqtoken_result['oauth_token'] == self.request.get('oauth_token'):
            result = oauth_client.obtain_access_token(reqtoken_result['oauth_token'], reqtoken_result['oauth_token_secret'], self.request.get('oauth_verifier'))
            account.twitter_user = result['screen_name']
            account.twitter_token = result['oauth_token']
            account.twitter_secret = result['oauth_token_secret']
            self.put_with_new_sid(account)
            logging.info('(%d) Join: twitter="%s"', account.key().id(), account.twitter_user)
        else:
            logging.debug('Unexpected request.')
        self.redirect('/settings.html')


class TwitProxyPage(common.BasePage):
    def post(self):
        account = self.get_account()
        if not account or not account.twitter_user:
            logging.debug('Not Logged in.')
            self.error(400)
            return
        if account.session_token != self.request.headers.get('X-Imakoko-Token'):
            logging.warning('(%d) session_token mismatch.', account.key().id())
            self.error(500)
            return

        logging.debug('(%d) Twit: %s', account.key().id(), account.twitter_user)
        data = self.request.body

        try:
            parsed = cgi.parse_qs(data)
            parsed['status'][0] = shorten_url_pattern.sub(shorten_url, parsed['status'][0], 1)
            data = '&'.join(escape(k) + '=' + escape(parsed[k][0]) for k in parsed)
        except:
            pass

        headers = oauth_client.build_oauth_header('POST', TWITTER_POST_URL, data, account.twitter_token, account.twitter_secret)
        result = urlfetch.fetch(TWITTER_POST_URL, data, urlfetch.POST, headers)

        status_code = result.status_code
        if status_code == 401:
            logging.info('(%d) Leave: twitter="%s"', account.key().id(), account.twitter_user)
            account.twitter_user = None
            account.twitter_token = None
            account.twitter_secret = None
            account.put()
            self.error(400)
            return

        self.response.set_status(status_code)
#        content_type = result.headers.get('Content-Type')
#        if content_type:
#            self.response.headers['Content-Type'] = content_type
#        self.response.out.write(result.content)


app = webapp2.WSGIApplication(
    [('/twitter/oauth', TwitterOAuthPage),
     ('/twitter/callback', TwitterCallbackPage),
     ('/twitter/twit', TwitProxyPage)])
