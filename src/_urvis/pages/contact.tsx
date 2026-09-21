import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Building } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { useSEO } from "@urvis/hooks/useSEO";

import { Button } from "@urvis/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@urvis/components/ui/form";
import { Input } from "@urvis/components/ui/input";
import { Textarea } from "@urvis/components/ui/textarea";
import { useToast } from "@urvis/hooks/use-toast";
import { useSubmitContact } from '@urvis/hooks/useSubmitContact';

export default function Contact() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const submitContact = useSubmitContact();

  useSEO({
    title: `${t("contact.title")} | URVIS Razlakiranje Kovin`,
    description: "Za vsa vprašanja, ponudbe in tehnično svetovanje smo vam na voljo. Pišite ali pokličite.",
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/kontakt`,
  });

  const formSchema = z.object({
    name: z.string().min(2, `${t("contact.f_name")} ${t("contact.required")}`),
    email: z.string().email("Neveljaven email naslov"),
    phone: z.string().optional(),
    company: z.string().optional(),
    message: z.string().min(10, `${t("contact.f_msg")} ${t("contact.required")}`),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", phone: "", company: "", message: "" },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    submitContact.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: t("contact.ok_title"), description: t("contact.ok_msg") });
        form.reset();
      },
      onError: () => {
        toast({ variant: "destructive", title: t("contact.err_title"), description: t("contact.err_msg") });
      }
    });
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* Header */}
      <section className="relative min-h-[38vh] flex items-center justify-center pt-28 pb-12 bg-secondary text-white text-center w-full">
        <div className="container mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-4xl sm:text-5xl md:text-7xl mb-6">{t("contact.title")}</h1>
            <p className="text-white/70 text-lg md:text-xl font-medium max-w-2xl mx-auto">
              Za vsa vprašanja, ponudbe in tehnično svetovanje smo vam na voljo.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-14 md:py-24">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16">

            {/* Contact Info */}
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="mb-8 md:mb-12">
                <h2 className="text-3xl font-display mb-8">{t("contact.company")}</h2>

                <div className="space-y-8">
                  <div className="flex gap-4">
                    <MapPin className="w-6 h-6 text-primary shrink-0 mt-1" />
                    <div>
                      <h4 className="font-bold text-foreground mb-1 uppercase tracking-widest text-sm">{t("contact.head_office")}</h4>
                      <p className="text-muted-foreground">Laze pri Dramljah 14 A<br />3222 Dramlje</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Building className="w-6 h-6 text-primary shrink-0 mt-1" />
                    <div>
                      <h4 className="font-bold text-foreground mb-1 uppercase tracking-widest text-sm">{t("contact.branch")}</h4>
                      <p className="text-muted-foreground">P.E. Eko Peč<br />Šentjur</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Mail className="w-6 h-6 text-primary shrink-0 mt-1" />
                    <div>
                      <h4 className="font-bold text-foreground mb-1 uppercase tracking-widest text-sm">E-pošta</h4>
                      <a href="mailto:ekopec@urvis.si" className="text-muted-foreground hover:text-primary transition-colors">ekopec@urvis.si</a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-8 bg-muted border border-border">
                <h3 className="text-xl font-display mb-6">{t("contact.key_people")}</h3>
                <div className="space-y-6">
                  <div>
                    <strong className="block text-foreground">Matej Lavbič</strong>
                    <span className="text-sm text-primary uppercase tracking-widest block mb-1">Direktor</span>
                    <a href="tel:+38670638194" className="text-muted-foreground hover:text-foreground flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" /> +386 70 638 194
                    </a>
                  </div>
                  <div>
                    <strong className="block text-foreground">Dejan Gorošek</strong>
                    <span className="text-sm text-primary uppercase tracking-widest block mb-1">Proizvodnja</span>
                    <a href="tel:031733398" className="text-muted-foreground hover:text-foreground flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" /> 031 733 398
                    </a>
                    <a href="tel:037463412" className="text-muted-foreground hover:text-foreground flex items-center gap-2 mt-1">
                      <Phone className="w-3.5 h-3.5" /> 03 746 34 12
                    </a>
                  </div>
                  <div>
                    <strong className="block text-foreground">Andrej Selčan</strong>
                    <span className="text-sm text-primary uppercase tracking-widest block mb-1">Računovodstvo</span>
                    <a href="tel:082003499" className="text-muted-foreground hover:text-foreground flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5" /> 08 200 3499
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <div className="bg-card border p-6 md:p-10 shadow-sm">
                <h3 className="text-2xl font-display mb-8">{t("contact.send")}</h3>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase text-xs font-bold tracking-widest">{t("contact.f_name")} *</FormLabel>
                          <FormControl>
                            <Input placeholder={t("contact.f_name_ph")} className="rounded-none h-12 bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="uppercase text-xs font-bold tracking-widest">{t("contact.f_email")} *</FormLabel>
                            <FormControl>
                              <Input placeholder={t("contact.f_email_ph")} type="email" className="rounded-none h-12 bg-background" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="uppercase text-xs font-bold tracking-widest">{t("contact.f_phone")}</FormLabel>
                            <FormControl>
                              <Input placeholder={t("contact.f_phone_ph")} className="rounded-none h-12 bg-background" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase text-xs font-bold tracking-widest">{t("contact.f_company")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("contact.f_company_ph")} className="rounded-none h-12 bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="uppercase text-xs font-bold tracking-widest">{t("contact.f_msg")} *</FormLabel>
                          <FormControl>
                            <Textarea placeholder={t("contact.f_msg_ph")} className="rounded-none min-h-[150px] bg-background" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={submitContact.isPending} className="w-full bg-primary hover:bg-primary/90 text-white rounded-none h-14 uppercase tracking-widest font-bold">
                      {submitContact.isPending ? t("contact.f_sending") : t("contact.f_submit")}
                    </Button>
                  </form>
                </Form>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

    </div>
  );
}
