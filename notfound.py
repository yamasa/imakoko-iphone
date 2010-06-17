#!/usr/bin/env python
# -*- coding:utf-8 -*-

from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app

class MapRedirectPage(webapp.RequestHandler):
    def get(self):
        self.redirect('/m/', permanent=True)

application = webapp.WSGIApplication(
    [('/m', MapRedirectPage)])

def main():
    run_wsgi_app(application)

if __name__ == '__main__':
    main()
