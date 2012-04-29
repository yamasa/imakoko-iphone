#!/usr/bin/env python
# -*- coding:utf-8 -*-

import base64
import cgi
import hashlib
import hmac
import random
import time
import urllib
import urllib2
import urlparse

def _utf8_str(s):
    if s is None:
        return ''
    elif isinstance(s, unicode):
        return s.encode('utf-8')
    else:
        return str(s)

def escape(s):
    return urllib.quote(_utf8_str(s), safe='~')

def _build_signature_base_string(oauth_params, http_method, http_url, http_data):

    normalized_http_method = http_method.upper()

    url_parts = urlparse.urlsplit(http_url)
    scheme = url_parts.scheme
    host = url_parts.hostname
    port = url_parts.port
    if port is not None:
        if not ((port == 80 and scheme == 'http') or (port == 443 and scheme == 'https')):
            host += ':' + str(port)
    path = url_parts.path
    if not path:
        path = '/'
    normalized_http_url = scheme + '://' + host + path

    params = list(oauth_params)
    if url_parts.query:
        params.extend(cgi.parse_qsl(url_parts.query, True))
    if http_data:
        params.extend(cgi.parse_qsl(http_data, True))
    params = [(escape(k), escape(v)) for k, v in params]
    params.sort()
    normalized_params = '&'.join(k + '=' + v for k, v in params)

    return escape(normalized_http_method) + '&' + escape(normalized_http_url) + '&' + escape(normalized_params)


class OAuthSignatureMethod_PLAINTEXT:
    def get_name(self):
        return 'PLAINTEXT'

    def calc_signature(self, consumer_secret, token_secret, oauth_params, http_method, http_url, http_data):
        return escape(consumer_secret) + '&' + escape(token_secret)


class OAuthSignatureMethod_HMAC_SHA1:
    def get_name(self):
        return 'HMAC-SHA1'

    def calc_signature(self, consumer_secret, token_secret, oauth_params, http_method, http_url, http_data):
        key = escape(consumer_secret) + '&' + escape(token_secret)
        base_string = _build_signature_base_string(oauth_params, http_method, http_url, http_data)
        return base64.b64encode(hmac.new(key, base_string, hashlib.sha1).digest())


def default_http_fetcher(url, data, headers):
    response = urllib2.urlopen(urllib2.Request(url, data, headers))
    try:
        return response.read()
    finally:
        response.close()


class OAuthClient:
    def __init__(self, consumer_key, consumer_secret, signature_method, http_fetcher=None):
        self.consumer_key = consumer_key
        self.consumer_secret = consumer_secret
        self.signature_method = signature_method
        if http_fetcher is None:
            self.http_fetcher = default_http_fetcher
        else:
            self.http_fetcher = http_fetcher

    def build_oauth_params(self, http_method, http_url, http_data, token=None, token_secret=None, verifier=None, callback=None):
        oauth_params = [
            ('oauth_consumer_key', self.consumer_key),
            ('oauth_signature_method', self.signature_method.get_name()),
            ('oauth_timestamp', str(int(time.time()))),
            ('oauth_nonce', '%016x' % random.getrandbits(64))]
        if token is not None:
            oauth_params.append(('oauth_token', token))
            if verifier is not None:
                oauth_params.append(('oauth_verifier', verifier))
        elif callback is not None:
            oauth_params.append(('oauth_callback', callback))

        signature = self.signature_method.calc_signature(self.consumer_secret, token_secret, oauth_params, http_method, http_url, http_data)
        oauth_params.append(('oauth_signature', signature))
        return oauth_params

    def build_oauth_header(self, http_method, http_url, http_data, token=None, token_secret=None, verifier=None, callback=None):
        oauth_params = self.build_oauth_params(http_method, http_url, http_data, token, token_secret, verifier, callback)
        return { 'Authorization': 'OAuth ' + ', '.join(escape(k) + '="' + escape(v) + '"' for k, v in oauth_params) }

    def fetch_with_oauth_header(self, http_url, http_data, token=None, token_secret=None, verifier=None, callback=None):
        if http_data is None:
            http_method = 'GET'
        else:
            http_method = 'POST'
        oauth_header = self.build_oauth_header(http_method, http_url, http_data, token, token_secret, verifier, callback)
        return self.http_fetcher(http_url, http_data, oauth_header)


class TwitterClient(OAuthClient):
    def __init__(self, consumer_key, consumer_secret, http_fetcher=None):
        OAuthClient.__init__(self, consumer_key, consumer_secret, OAuthSignatureMethod_HMAC_SHA1(), http_fetcher)

    def obtain_request_token(self, callback_url='oob'):
        content = self.fetch_with_oauth_header('https://api.twitter.com/oauth/request_token', '', callback=callback_url)
        parsed = cgi.parse_qs(content, True)
        token = parsed['oauth_token'][0]
        token_secret = parsed['oauth_token_secret'][0]
        url = 'https://api.twitter.com/oauth/authorize?oauth_token=' + escape(token)
        return { 'oauth_token': token, 'oauth_token_secret': token_secret, 'authorization_url': url }

    def obtain_access_token(self, token, token_secret, verifier):
        content = self.fetch_with_oauth_header('https://api.twitter.com/oauth/access_token', '', token, token_secret, verifier)
        parsed = cgi.parse_qs(content, True)
        token = parsed['oauth_token'][0]
        token_secret = parsed['oauth_token_secret'][0]
        user_id = parsed['user_id'][0]
        screen_name = parsed['screen_name'][0]
        return { 'oauth_token': token, 'oauth_token_secret': token_secret, 'user_id': user_id, 'screen_name': screen_name }

    def obtain_access_token_xauth(self, username, password):
        content = self.fetch_with_oauth_header('https://api.twitter.com/oauth/access_token', 'x_auth_mode=client_auth&x_auth_username=%s&x_auth_password=%s' % (escape(username), escape(password)))
        parsed = cgi.parse_qs(content, True)
        token = parsed['oauth_token'][0]
        token_secret = parsed['oauth_token_secret'][0]
        user_id = parsed['user_id'][0]
        screen_name = parsed['screen_name'][0]
        return { 'oauth_token': token, 'oauth_token_secret': token_secret, 'user_id': user_id, 'screen_name': screen_name }
