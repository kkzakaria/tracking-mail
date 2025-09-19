'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Eye,
  Copy,
  Play,
  CheckCircle2,
  AlertCircle,
  Image,
  Code,
  RefreshCw
} from 'lucide-react';

interface PixelTestResult {
  success: boolean;
  trackingId: string;
  responseTime?: number;
  contentType?: string;
  pixelSize?: { width: number; height: number };
  error?: string;
  timestamp: Date;
}

export function PixelTester() {
  const [trackingId, setTrackingId] = useState('');
  const [testResult, setTestResult] = useState<PixelTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Générer un tracking ID de test
  const generateTestTrackingId = () => {
    const randomId = 'track_test_' + Math.random().toString(36).substring(2, 15);
    setTrackingId(randomId);
  };

  // Tester le pixel de tracking
  const testPixelTracking = async () => {
    if (!trackingId.trim()) {
      setTestResult({
        success: false,
        trackingId: '',
        error: 'Veuillez saisir un tracking ID',
        timestamp: new Date()
      });
      return;
    }

    setTesting(true);
    setProgress(0);
    setTestResult(null);

    try {
      // Simulation du progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      const startTime = Date.now();

      // Test de l'endpoint pixel
      const response = await fetch(`/api/tracking/pixel/${trackingId}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Email-Tracking-Test/1.0',
          'Accept': 'image/*'
        }
      });

      const responseTime = Date.now() - startTime;
      clearInterval(progressInterval);
      setProgress(100);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';

        // Pour les images, on peut tenter d'obtenir les dimensions
        let pixelSize = undefined;
        if (contentType.startsWith('image/')) {
          // En théorie, un pixel de tracking fait 1x1
          pixelSize = { width: 1, height: 1 };
        }

        setTestResult({
          success: true,
          trackingId,
          responseTime,
          contentType,
          pixelSize,
          timestamp: new Date()
        });
      } else {
        setTestResult({
          success: false,
          trackingId,
          responseTime,
          error: `Erreur HTTP ${response.status}: ${response.statusText}`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      setProgress(100);
      setTestResult({
        success: false,
        trackingId,
        error: error instanceof Error ? error.message : 'Erreur réseau',
        timestamp: new Date()
      });
    } finally {
      setTesting(false);
    }
  };

  // Copier dans le presse-papiers
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Obtenir l'URL complète du pixel
  const getPixelUrl = (id: string) => {
    return `${window.location.origin}/api/tracking/pixel/${id}`;
  };

  // Générer le code HTML du pixel
  const generatePixelHTML = (id: string) => {
    return `<img src="${getPixelUrl(id)}" width="1" height="1" style="display:none;" alt="" />`;
  };

  return (
    <div className="space-y-6">
      {/* Configuration du test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Configuration du Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="tracking-id">Tracking ID</Label>
              <Input
                id="tracking-id"
                placeholder="track_abc123def456..."
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={generateTestTrackingId}
                variant="outline"
                size="default"
              >
                Générer ID Test
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={testPixelTracking}
              disabled={testing || !trackingId.trim()}
            >
              <Play className={`w-4 h-4 mr-2 ${testing ? 'animate-pulse' : ''}`} />
              {testing ? 'Test en cours...' : 'Tester le Pixel'}
            </Button>
          </div>

          {/* Progress bar pendant le test */}
          {testing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Test du pixel en cours...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Résultat du test */}
      {testResult && (
        <Alert className={testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertTitle>
              {testResult.success ? 'Test réussi !' : 'Test échoué'}
            </AlertTitle>
          </div>
          <AlertDescription className="mt-2">
            {testResult.success ? (
              <div className="space-y-3">
                <p>Le pixel de tracking fonctionne correctement.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Label>Temps de réponse:</Label>
                    <Badge variant="outline">{testResult.responseTime}ms</Badge>
                  </div>

                  {testResult.contentType && (
                    <div className="flex items-center gap-2">
                      <Label>Type de contenu:</Label>
                      <Badge variant="outline">{testResult.contentType}</Badge>
                    </div>
                  )}

                  {testResult.pixelSize && (
                    <div className="flex items-center gap-2">
                      <Label>Dimensions:</Label>
                      <Badge variant="outline">
                        {testResult.pixelSize.width}x{testResult.pixelSize.height}
                      </Badge>
                    </div>
                  )}
                </div>

                <p className="text-sm text-green-700">
                  ✅ Le pixel peut être intégré dans vos emails pour tracker les ouvertures.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-red-700">{testResult.error}</p>
                <p className="text-sm text-red-600 mt-1">
                  Vérifiez que le tracking ID est valide et que l'endpoint est fonctionnel.
                </p>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      {/* Informations sur le pixel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* URL du pixel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Image className="w-5 h-5" />
              URL du Pixel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trackingId ? (
              <>
                <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
                  {getPixelUrl(trackingId)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(getPixelUrl(trackingId))}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier l'URL
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                Saisissez un tracking ID pour voir l'URL du pixel
              </p>
            )}
          </CardContent>
        </Card>

        {/* Code HTML */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Code className="w-5 h-5" />
              Code HTML
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {trackingId ? (
              <>
                <div className="p-3 bg-muted rounded-lg font-mono text-sm break-all">
                  {generatePixelHTML(trackingId)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(generatePixelHTML(trackingId))}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copier le code
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">
                Saisissez un tracking ID pour voir le code HTML
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Informations techniques */}
      <Card>
        <CardHeader>
          <CardTitle>Comment ça fonctionne ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="space-y-2">
            <p>
              <strong>1. Pixel invisible :</strong> Une image 1x1 pixel transparente est insérée dans l'email.
            </p>
            <p>
              <strong>2. Requête automatique :</strong> Quand l'email est ouvert, le client email fait une requête HTTP pour charger l'image.
            </p>
            <p>
              <strong>3. Tracking :</strong> Notre serveur enregistre cette requête avec l'IP, user-agent et timestamp.
            </p>
            <p>
              <strong>4. Analytics :</strong> Ces données permettent de calculer les taux d'ouverture et statistiques.
            </p>
          </div>

          <div className="mt-4 p-3 border rounded-lg bg-blue-50 border-blue-200">
            <p className="text-blue-800">
              <strong>💡 Conseil :</strong> Testez toujours vos pixels avant d'envoyer des emails en production.
              Certains clients email bloquent les images externes par défaut.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}