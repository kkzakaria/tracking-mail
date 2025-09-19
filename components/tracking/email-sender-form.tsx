'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
  Eye,
  MousePointer,
  Reply,
  Copy
} from 'lucide-react';

// Schéma de validation
const emailFormSchema = z.object({
  to: z.string().email('Adresse email invalide'),
  subject: z.string().min(1, 'Le sujet est requis').max(200, 'Sujet trop long'),
  body: z.string().min(1, 'Le contenu est requis').max(5000, 'Contenu trop long'),
  bodyType: z.enum(['text', 'html']),
  enableTracking: z.boolean(),
  trackOpens: z.boolean(),
  trackClicks: z.boolean(),
  trackReplies: z.boolean(),
});

type EmailFormData = z.infer<typeof emailFormSchema>;

interface SendResult {
  success: boolean;
  trackingId?: string;
  messageId?: string;
  error?: string;
}

export function EmailSenderForm() {
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [isSending, setIsSending] = useState(false);

  const form = useForm<EmailFormData>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      to: '',
      subject: 'Test Email avec Tracking',
      body: 'Ceci est un email de test pour valider le système de tracking.\n\nCet email contient un pixel de tracking invisible qui détectera son ouverture.',
      bodyType: 'text',
      enableTracking: true,
      trackOpens: true,
      trackClicks: true,
      trackReplies: true,
    },
  });

  const watchTracking = form.watch('enableTracking');

  // Fonction d'envoi de l'email
  const onSubmit = async (data: EmailFormData) => {
    setIsSending(true);
    setSendResult(null);

    try {
      const payload = {
        to: data.to,
        subject: data.subject,
        body: data.body,
        bodyType: data.bodyType,
        enableTracking: data.enableTracking,
        trackingOptions: data.enableTracking ? {
          trackOpens: data.trackOpens,
          trackClicks: data.trackClicks,
          trackReplies: data.trackReplies
        } : undefined
      };

      const response = await fetch('/api/mail/send-tracked', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSendResult({
          success: true,
          trackingId: result.data?.trackingId,
          messageId: result.data?.messageId
        });
      } else {
        setSendResult({
          success: false,
          error: result.error?.message || result.message || "Erreur lors de l'envoi"
        });
      }
    } catch (error) {
      console.error('Error sending email:', error);
      setSendResult({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur réseau'
      });
    } finally {
      setIsSending(false);
    }
  };

  // Fonction pour copier dans le presse-papiers
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Destinataire et Sujet */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destinataire</FormLabel>
                  <FormControl>
                    <Input placeholder="destinataire@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sujet</FormLabel>
                  <FormControl>
                    <Input placeholder="Sujet de l'email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Type de contenu */}
          <FormField
            control={form.control}
            name="bodyType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type de contenu</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner le type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="text">Texte brut</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Contenu de l'email */}
          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contenu de l'email</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Contenu de votre email..."
                    className="min-h-[120px]"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {form.watch('bodyType') === 'html' ? 'Contenu HTML autorisé' : 'Texte brut uniquement'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          {/* Options de tracking */}
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="enableTracking"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Activer le tracking</FormLabel>
                    <FormDescription>
                      Ajouter les fonctionnalités de tracking à cet email
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Options de tracking détaillées */}
            {watchTracking && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Options de Tracking</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="trackOpens"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            Tracking d'ouverture
                          </FormLabel>
                          <FormDescription>
                            Détecter quand l'email est ouvert (pixel invisible)
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="trackClicks"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="flex items-center gap-2">
                            <MousePointer className="w-4 h-4" />
                            Tracking de clics
                          </FormLabel>
                          <FormDescription>
                            Remplacer les liens par des liens trackés
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="trackReplies"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="flex items-center gap-2">
                            <Reply className="w-4 h-4" />
                            Tracking de réponses
                          </FormLabel>
                          <FormDescription>
                            Détecter les réponses via webhooks Microsoft Graph
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Bouton d'envoi */}
          <Button
            type="submit"
            disabled={isSending}
            className="w-full md:w-auto"
          >
            <Send className={`w-4 h-4 mr-2 ${isSending ? 'animate-pulse' : ''}`} />
            {isSending ? 'Envoi en cours...' : 'Envoyer l\'email'}
          </Button>
        </form>
      </Form>

      {/* Résultat de l'envoi */}
      {sendResult && (
        <Alert className={sendResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <div className="flex items-center gap-2">
            {sendResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertTitle>
              {sendResult.success ? 'Email envoyé avec succès !' : 'Erreur lors de l\'envoi'}
            </AlertTitle>
          </div>
          <AlertDescription className="mt-2">
            {sendResult.success ? (
              <div className="space-y-3">
                <p>Votre email de test a été envoyé avec le tracking activé.</p>

                {sendResult.trackingId && (
                  <div className="flex items-center gap-2 p-2 bg-white rounded border">
                    <Label className="text-sm font-medium">Tracking ID:</Label>
                    <Badge variant="outline" className="font-mono text-xs">
                      {sendResult.trackingId}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(sendResult.trackingId!)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {sendResult.messageId && (
                  <div className="flex items-center gap-2 p-2 bg-white rounded border">
                    <Label className="text-sm font-medium">Message ID:</Label>
                    <Badge variant="outline" className="font-mono text-xs">
                      {sendResult.messageId}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(sendResult.messageId!)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                <p className="text-sm text-green-700">
                  💡 Consultez l'onglet "Analytics" pour voir les résultats du tracking en temps réel.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-red-700">{sendResult.error}</p>
                <p className="text-sm text-red-600 mt-1">
                  Vérifiez votre authentification et les paramètres de configuration.
                </p>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}