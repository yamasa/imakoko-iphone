#!/usr/bin/env python
# -*- coding:utf-8 -*-

import webapp2

class MapRedirectPage(webapp2.RequestHandler):
    def get(self):
        self.redirect('/m/', permanent=True)

app = webapp2.WSGIApplication(
    [('/m', MapRedirectPage)])
