'use client';

import '@urvis/i18n';
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from '@urvis/components/ui/toaster';
import { TooltipProvider } from '@urvis/components/ui/tooltip';
import NotFound from '@urvis/pages/not-found';

import Home from '@urvis/pages/home';
import About from '@urvis/pages/about';
import Technologies from '@urvis/pages/technologies';
import Razlakiranje from '@urvis/pages/razlakiranje';
import Stabilizacija from '@urvis/pages/stabilizacija';
import Galerija from '@urvis/pages/gallery';
import Partners from '@urvis/pages/partners';
import Contact from '@urvis/pages/contact';
import BlogIndex from '@urvis/pages/blog-index';
import BlogPost from '@urvis/pages/blog-post';

// Landing pages (not in navbar)
import LandingRazlakiranjeKovin from '@urvis/pages/landing/razlakiranje-kovin';
import LandingRazlakiranjeObesal from '@urvis/pages/landing/razlakiranje-obesal';
import LandingOdstranjevanjePraskastiBarve from '@urvis/pages/landing/odstranjevanje-praskaste-barve';
import LandingCiscenieKovinskihDelov from '@urvis/pages/landing/ciscenje-kovinskih-delov';
import LandingTermicnoOdstranjevanjeBarve from '@urvis/pages/landing/termicno-odstranjevanje-barve';
import LandingIndustrijskoRazlakiranje from '@urvis/pages/landing/industrijsko-razlakiranje';

import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from '@urvis/components/layout/Layout';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/o-podjetju" component={About} />
      <Route path="/tehnologije" component={Technologies} />
      <Route path="/razlakiranje" component={Razlakiranje} />
      <Route path="/stabilizacija" component={Stabilizacija} />
      <Route path="/galerija" component={Galerija} />
      <Route path="/partnerji" component={Partners} />
      <Route path="/kontakt" component={Contact} />
      <Route path="/blog" component={BlogIndex} />
      <Route path="/blog/:slug" component={BlogPost} />

      {/* SEO landing pages – not in navbar */}
      <Route path="/razlakiranje-kovin" component={LandingRazlakiranjeKovin} />
      <Route path="/razlakiranje-obesal" component={LandingRazlakiranjeObesal} />
      <Route path="/odstranjevanje-praskaste-barve" component={LandingOdstranjevanjePraskastiBarve} />
      <Route path="/ciscenje-kovinskih-delov" component={LandingCiscenieKovinskihDelov} />
      <Route path="/termicno-odstranjevanje-barve" component={LandingTermicnoOdstranjevanjeBarve} />
      <Route path="/industrijsko-razlakiranje" component={LandingIndustrijskoRazlakiranje} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <Suspense fallback={null}>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <div className="urvis-root">
              <WouterRouter base="/urvis">
                <Layout>
                  <Router />
                </Layout>
              </WouterRouter>
              <Toaster />
            </div>
          </TooltipProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </Suspense>
  );
}

export default App;
