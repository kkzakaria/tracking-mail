'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/use-auth';
import { useUsers, useUserMail, useSendMail } from '@/lib/hooks/use-graph';
import { formatUserDisplayName, getUserPrimaryEmail, formatDateTime } from '@/lib/utils/graph-helpers';

export default function Dashboard() {
  const { authenticated, user, loading: authLoading, login, logout } = useAuth();
  const { data: usersData, loading: usersLoading, execute: fetchUsers } = useUsers();
  const { data: mailData, loading: mailLoading, execute: fetchMail } = useUserMail();
  const { execute: sendMail, loading: sendingMail } = useSendMail();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [emailForm, setEmailForm] = useState({
    subject: '',
    body: '',
    toRecipients: '',
    ccRecipients: ''
  });

  useEffect(() => {
    if (authenticated) {
      fetchUsers({ limit: 20 });
    }
  }, [authenticated, fetchUsers]);

  const handleUserSelect = async (userId: string) => {
    setSelectedUserId(userId);
    await fetchMail({ limit: 10, unreadOnly: false });
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    const toEmails = emailForm.toRecipients.split(',').map(email => email.trim()).filter(Boolean);
    const ccEmails = emailForm.ccRecipients.split(',').map(email => email.trim()).filter(Boolean);

    const result = await sendMail(selectedUserId, {
      subject: emailForm.subject,
      body: emailForm.body,
      toRecipients: toEmails,
      ccRecipients: ccEmails.length > 0 ? ccEmails : undefined,
      importance: 'normal'
    });

    if (result) {
      alert('Email envoyé avec succès!');
      setEmailForm({ subject: '', body: '', toRecipients: '', ccRecipients: '' });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Vérification de l&apos;authentification...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              Tracking Mail Dashboard
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Connectez-vous avec votre compte Microsoft pour accéder au dashboard
            </p>
          </div>
          <div>
            <button
              onClick={login}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Se connecter avec Microsoft
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Tracking Mail Dashboard
            </h1>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user?.displayName}</p>
                <p className="text-sm text-gray-500">{user?.mail}</p>
              </div>
              <button
                onClick={logout}
                className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Liste des utilisateurs */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Utilisateurs
                </h3>

                {usersLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {usersData?.users.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleUserSelect(user.id)}
                        className={`w-full text-left p-3 rounded-md transition-colors ${
                          selectedUserId === user.id
                            ? 'bg-blue-100 border-blue-500 border'
                            : 'hover:bg-gray-50 border border-gray-200'
                        }`}
                      >
                        <div className="font-medium text-sm text-gray-900">
                          {formatUserDisplayName(user)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {getUserPrimaryEmail(user)}
                        </div>
                        {user.department && (
                          <div className="text-xs text-gray-400">
                            {user.department}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contenu principal */}
          <div className="lg:col-span-2 space-y-8">
            {/* Formulaire d'envoi d'email */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Envoyer un Email
                </h3>

                <form onSubmit={handleSendEmail} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Destinataires (séparés par des virgules)
                    </label>
                    <input
                      type="text"
                      value={emailForm.toRecipients}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, toRecipients: e.target.value }))}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      placeholder="email1@example.com, email2@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      CC (optionnel)
                    </label>
                    <input
                      type="text"
                      value={emailForm.ccRecipients}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, ccRecipients: e.target.value }))}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      placeholder="cc@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Sujet
                    </label>
                    <input
                      type="text"
                      value={emailForm.subject}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Message
                    </label>
                    <textarea
                      value={emailForm.body}
                      onChange={(e) => setEmailForm(prev => ({ ...prev, body: e.target.value }))}
                      rows={6}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingMail || !selectedUserId}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {sendingMail ? 'Envoi en cours...' : 'Envoyer Email'}
                  </button>

                  {!selectedUserId && (
                    <p className="text-sm text-gray-500 text-center">
                      Sélectionnez un utilisateur pour envoyer un email
                    </p>
                  )}
                </form>
              </div>
            </div>

            {/* Liste des emails */}
            {selectedUserId && (
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Emails Récents
                  </h3>

                  {mailLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse border-b pb-4">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2 mb-1"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                        </div>
                      ))}
                    </div>
                  ) : mailData && mailData.messages.length > 0 ? (
                    <div className="space-y-4">
                      {mailData.messages.map((message) => (
                        <div key={message.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900">
                                {message.subject || 'Pas de sujet'}
                              </h4>
                              <p className="text-sm text-gray-600">
                                De: {message.from?.emailAddress?.name || message.from?.emailAddress?.address}
                              </p>
                              <p className="text-sm text-gray-500">
                                {formatDateTime(new Date(message.receivedDateTime))}
                              </p>
                              {message.bodyPreview && (
                                <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                                  {message.bodyPreview}
                                </p>
                              )}
                            </div>
                            <div className="flex space-x-2">
                              {!message.isRead && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  Non lu
                                </span>
                              )}
                              {message.importance === 'high' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  Important
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">
                      Aucun email trouvé pour cet utilisateur
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}