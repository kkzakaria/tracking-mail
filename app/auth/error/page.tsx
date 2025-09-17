'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const description = searchParams.get('description');

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case 'access_denied':
        return {
          title: 'Accès Refusé',
          message: 'Vous avez refusé l&apos;autorisation d&apos;accès à l&apos;application.',
          suggestion: 'Pour utiliser l\'application, vous devez accepter les permissions demandées.'
        };
      case 'invalid_request':
        return {
          title: 'Requête Invalide',
          message: 'La requête d\'authentification est invalide ou incomplète.',
          suggestion: 'Veuillez réessayer de vous connecter.'
        };
      case 'invalid_state':
        return {
          title: 'État de Session Invalide',
          message: 'L\'état de la session d\'authentification est invalide ou a expiré.',
          suggestion: 'Cette erreur peut survenir si vous restez trop longtemps sur la page de connexion. Veuillez réessayer.'
        };
      case 'server_error':
        return {
          title: 'Erreur Serveur',
          message: 'Une erreur inattendue s&apos;est produite sur le serveur.',
          suggestion: 'Veuillez réessayer dans quelques minutes. Si le problème persiste, contactez l\'administrateur.'
        };
      case 'token_exchange_failed':
        return {
          title: 'Échec d\'Échange de Token',
          message: 'L&apos;échange du code d&apos;autorisation contre un token d&apos;accès a échoué.',
          suggestion: 'Cette erreur peut être temporaire. Veuillez réessayer de vous connecter.'
        };
      case 'temporarily_unavailable':
        return {
          title: 'Service Temporairement Indisponible',
          message: 'Le service d\'authentification Microsoft est temporairement indisponible.',
          suggestion: 'Veuillez réessayer dans quelques minutes.'
        };
      case 'invalid_client':
        return {
          title: 'Configuration d\'Application Invalide',
          message: 'La configuration de l\'application Azure AD est invalide.',
          suggestion: 'Contactez l\'administrateur pour vérifier la configuration.'
        };
      case 'unauthorized_client':
        return {
          title: 'Client Non Autorisé',
          message: 'Cette application n\'est pas autorisée à utiliser ce flux d\'authentification.',
          suggestion: 'Contactez l\'administrateur pour vérifier les permissions de l\'application.'
        };
      case 'unsupported_response_type':
        return {
          title: 'Type de Réponse Non Supporté',
          message: 'Le type de réponse demandé n\'est pas supporté par le serveur d\'autorisation.',
          suggestion: 'Contactez l\'administrateur pour vérifier la configuration.'
        };
      case 'invalid_scope':
        return {
          title: 'Portée Invalide',
          message: 'Une ou plusieurs portées demandées sont invalides ou non autorisées.',
          suggestion: 'Contactez l\'administrateur pour vérifier les permissions requises.'
        };
      default:
        return {
          title: 'Erreur d\'Authentification',
          message: description || 'Une erreur d&apos;authentification inattendue s&apos;est produite.',
          suggestion: 'Veuillez réessayer de vous connecter. Si le problème persiste, contactez l\'administrateur.'
        };
    }
  };

  const errorInfo = getErrorMessage(error);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Error Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-6">
            <svg
              className="h-6 w-6 text-red-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>

          {/* Error Content */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {errorInfo.title}
            </h1>

            <p className="text-gray-600 mb-6">
              {errorInfo.message}
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-blue-400"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Suggestion:</strong> {errorInfo.suggestion}
                  </p>
                </div>
              </div>
            </div>

            {/* Error Details */}
            {(error || description) && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Détails techniques
                </summary>
                <div className="mt-2 bg-gray-50 border border-gray-200 rounded-md p-3">
                  {error && (
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Code d&apos;erreur:</strong> {error}
                    </p>
                  )}
                  {description && (
                    <p className="text-sm text-gray-600">
                      <strong>Description:</strong> {description}
                    </p>
                  )}
                </div>
              </details>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Link
                href="/"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Réessayer la Connexion
              </Link>

              <Link
                href="/"
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Retour à l&apos;Accueil
              </Link>
            </div>

            {/* Support Information */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Si vous continuez à rencontrer des problèmes, veuillez contacter l&apos;administrateur système
                avec le code d&apos;erreur affiché ci-dessus.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}