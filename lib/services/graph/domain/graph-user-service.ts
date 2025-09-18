/**
 * Service de gestion des utilisateurs Microsoft Graph
 * Responsable des opérations sur les utilisateurs de l'organisation
 */

import { GraphClientFactory } from '../core/graph-client-factory';
import { GraphRateLimitService } from '../core/graph-rate-limit-service';
import type {
  GraphOperationResult,
  MicrosoftUser,
  GraphApiUser,
  GraphRequestOptions
} from '@/lib/types/microsoft-graph';

/**
 * Options de filtrage pour les utilisateurs
 */
export interface UserFilterOptions {
  department?: string;
  jobTitle?: string;
  accountEnabled?: boolean;
  searchTerm?: string;
  limit?: number;
}

/**
 * Options de sélection des champs utilisateur
 */
export interface UserSelectOptions {
  includeBasic?: boolean;
  includeProfile?: boolean;
  includeContact?: boolean;
  includeOrganization?: boolean;
  customFields?: string[];
}

/**
 * Statistiques des utilisateurs
 */
export interface UserStatistics {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  byDepartment: Record<string, number>;
  byJobTitle: Record<string, number>;
}

/**
 * Service de gestion des utilisateurs Microsoft Graph
 */
export class GraphUserService {
  private static instance: GraphUserService;
  private clientFactory: GraphClientFactory;
  private rateLimitService: GraphRateLimitService;

  private readonly defaultSelectFields = [
    'id',
    'displayName',
    'mail',
    'userPrincipalName',
    'givenName',
    'surname',
    'jobTitle',
    'department',
    'accountEnabled'
  ];

  private constructor() {
    this.clientFactory = GraphClientFactory.getInstance();
    this.rateLimitService = GraphRateLimitService.getInstance();
  }

  /**
   * Obtenir l'instance unique du service
   */
  static getInstance(): GraphUserService {
    if (!GraphUserService.instance) {
      GraphUserService.instance = new GraphUserService();
    }
    return GraphUserService.instance;
  }

  /**
   * Obtenir tous les utilisateurs de l'organisation
   */
  async getAllUsers(
    options?: GraphRequestOptions & UserFilterOptions
  ): Promise<GraphOperationResult<MicrosoftUser[]>> {
    try {
      const clientResult = await this.clientFactory.createClientWithRetry();

      if (!clientResult.success || !clientResult.data) {
        return {
          success: false,
          error: clientResult.error || {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      const client = clientResult.data;
      const users: MicrosoftUser[] = [];
      let nextLink: string | null = '/users';

      // Construire la requête avec les filtres
      const query = this.buildUserQuery(options);

      while (nextLink) {
        const response = await this.rateLimitService.executeWithRetry(
          async () => {
            const request = client.api(nextLink!)
              .select(this.defaultSelectFields.join(','))
              .top(options?.limit || 100);

            // Appliquer les filtres si c'est la première requête
            if (nextLink === '/users' && query) {
              request.filter(query);
            }

            return request.get();
          },
          {
            timeout: options?.timeout,
            maxRetries: options?.retries || 2
          }
        );

        users.push(...this.mapGraphUsersToMicrosoftUsers(response.value));

        // Gérer la pagination
        nextLink = response['@odata.nextLink']
          ? new URL(response['@odata.nextLink']).pathname + new URL(response['@odata.nextLink']).search
          : null;

        // Arrêter si on a atteint la limite demandée
        if (options?.limit && users.length >= options.limit) {
          users.splice(options.limit);
          break;
        }
      }

      return { success: true, data: users };

    } catch (error) {
      console.error('Error getting all users:', error);
      return this.handleError(error, 'GET_USERS_ERROR', 'Erreur lors de la récupération des utilisateurs');
    }
  }

  /**
   * Obtenir un utilisateur par son email
   */
  async getUserByEmail(
    email: string,
    selectOptions?: UserSelectOptions
  ): Promise<GraphOperationResult<MicrosoftUser>> {
    try {
      const clientResult = await this.clientFactory.createClientWithRetry();

      if (!clientResult.success || !clientResult.data) {
        return {
          success: false,
          error: clientResult.error || {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      const client = clientResult.data;
      const selectFields = this.buildSelectFields(selectOptions);

      const response = await this.rateLimitService.executeWithRetry(
        () => client
          .api(`/users/${email}`)
          .select(selectFields.join(','))
          .get(),
        { timeout: 10000, maxRetries: 2 }
      );

      const user = this.mapGraphUserToMicrosoftUser(response);

      return { success: true, data: user };

    } catch (error) {
      console.error(`Error getting user by email ${email}:`, error);

      // Gérer les erreurs spécifiques
      if (this.isUserNotFoundError(error)) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: `Utilisateur ${email} non trouvé`
          }
        };
      }

      return this.handleError(error, 'GET_USER_ERROR', 'Erreur lors de la récupération de l\'utilisateur');
    }
  }

  /**
   * Obtenir les utilisateurs par département
   */
  async getUsersByDepartment(
    department: string,
    options?: GraphRequestOptions
  ): Promise<GraphOperationResult<MicrosoftUser[]>> {
    return this.getAllUsers({
      ...options,
      department
    });
  }

  /**
   * Rechercher des utilisateurs
   */
  async searchUsers(
    searchTerm: string,
    options?: GraphRequestOptions
  ): Promise<GraphOperationResult<MicrosoftUser[]>> {
    try {
      const clientResult = await this.clientFactory.createClientWithRetry();

      if (!clientResult.success || !clientResult.data) {
        return {
          success: false,
          error: clientResult.error || {
            code: 'NO_CLIENT',
            message: 'Impossible de créer le client Graph'
          }
        };
      }

      const client = clientResult.data;

      // Utiliser la recherche avec $search ou $filter selon le terme
      const searchQuery = this.buildSearchQuery(searchTerm);

      const response = await this.rateLimitService.executeWithRetry(
        () => client
          .api('/users')
          .header('ConsistencyLevel', 'eventual') // Nécessaire pour $search
          .search(searchQuery)
          .select(this.defaultSelectFields.join(','))
          .top(options?.limit || 50)
          .get(),
        {
          timeout: options?.timeout || 15000,
          maxRetries: options?.retries || 2
        }
      );

      const users = this.mapGraphUsersToMicrosoftUsers(response.value);

      return { success: true, data: users };

    } catch (error) {
      console.error(`Error searching users with term "${searchTerm}":`, error);
      return this.handleError(error, 'SEARCH_ERROR', 'Erreur lors de la recherche d\'utilisateurs');
    }
  }

  /**
   * Obtenir les statistiques des utilisateurs
   */
  async getUserStatistics(): Promise<GraphOperationResult<UserStatistics>> {
    try {
      const usersResult = await this.getAllUsers();

      if (!usersResult.success || !usersResult.data) {
        return {
          success: false,
          error: usersResult.error || {
            code: 'GET_USERS_ERROR',
            message: 'Impossible de récupérer les utilisateurs pour les statistiques'
          }
        };
      }

      const users = usersResult.data;
      const stats: UserStatistics = {
        totalUsers: users.length,
        activeUsers: 0,
        inactiveUsers: 0,
        byDepartment: {},
        byJobTitle: {}
      };

      // Calculer les statistiques
      for (const user of users) {
        // Compter les utilisateurs actifs/inactifs
        if (user.accountEnabled !== undefined) {
          if (user.accountEnabled) {
            stats.activeUsers++;
          } else {
            stats.inactiveUsers++;
          }
        }

        // Compter par département
        if (user.department) {
          stats.byDepartment[user.department] = (stats.byDepartment[user.department] || 0) + 1;
        }

        // Compter par titre
        if (user.jobTitle) {
          stats.byJobTitle[user.jobTitle] = (stats.byJobTitle[user.jobTitle] || 0) + 1;
        }
      }

      return { success: true, data: stats };

    } catch (error) {
      console.error('Error getting user statistics:', error);
      return this.handleError(error, 'STATS_ERROR', 'Erreur lors du calcul des statistiques');
    }
  }

  /**
   * Valider l'accès d'un utilisateur
   */
  async validateUserAccess(
    email: string,
    requiredPermissions?: string[]
  ): Promise<GraphOperationResult<boolean>> {
    try {
      // Vérifier que l'utilisateur existe
      const userResult = await this.getUserByEmail(email);

      if (!userResult.success || !userResult.data) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: `Utilisateur ${email} non trouvé`
          }
        };
      }

      const user = userResult.data;

      // Vérifier que le compte est actif
      if (user.accountEnabled === false) {
        return {
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Le compte utilisateur est désactivé'
          }
        };
      }

      // Si des permissions spécifiques sont requises, les vérifier
      if (requiredPermissions && requiredPermissions.length > 0) {
        // Cette logique pourrait être étendue pour vérifier les permissions réelles
        // Pour l'instant, on retourne true si l'utilisateur existe et est actif
        console.log(`Permissions à vérifier pour ${email}:`, requiredPermissions);
      }

      return { success: true, data: true };

    } catch (error) {
      console.error(`Error validating user access for ${email}:`, error);
      return this.handleError(error, 'VALIDATION_ERROR', 'Erreur lors de la validation de l\'accès');
    }
  }

  /**
   * Construire une requête de filtre pour les utilisateurs
   */
  private buildUserQuery(options?: UserFilterOptions): string | null {
    if (!options) return null;

    const filters: string[] = [];

    if (options.department) {
      filters.push(`department eq '${options.department}'`);
    }

    if (options.jobTitle) {
      filters.push(`jobTitle eq '${options.jobTitle}'`);
    }

    if (options.accountEnabled !== undefined) {
      filters.push(`accountEnabled eq ${options.accountEnabled}`);
    }

    if (options.searchTerm) {
      // Recherche sur plusieurs champs
      filters.push(`(startswith(displayName,'${options.searchTerm}') or startswith(mail,'${options.searchTerm}'))`);
    }

    return filters.length > 0 ? filters.join(' and ') : null;
  }

  /**
   * Construire une requête de recherche
   */
  private buildSearchQuery(searchTerm: string): string {
    // Utiliser la syntaxe de recherche Microsoft Graph
    return `"displayName:${searchTerm}" OR "mail:${searchTerm}" OR "userPrincipalName:${searchTerm}"`;
  }

  /**
   * Construire la liste des champs à sélectionner
   */
  private buildSelectFields(options?: UserSelectOptions): string[] {
    if (!options) return this.defaultSelectFields;

    let fields: string[] = [];

    if (options.includeBasic !== false) {
      fields.push('id', 'displayName', 'mail', 'userPrincipalName');
    }

    if (options.includeProfile) {
      fields.push('givenName', 'surname', 'preferredName', 'aboutMe');
    }

    if (options.includeContact) {
      fields.push('mobilePhone', 'businessPhones', 'officeLocation');
    }

    if (options.includeOrganization) {
      fields.push('department', 'jobTitle', 'companyName', 'manager');
    }

    if (options.customFields) {
      fields.push(...options.customFields);
    }

    // Éliminer les doublons
    return [...new Set(fields)];
  }

  /**
   * Mapper un utilisateur Graph API vers MicrosoftUser
   */
  private mapGraphUserToMicrosoftUser(graphUser: GraphApiUser): MicrosoftUser {
    return {
      id: graphUser.id,
      displayName: graphUser.displayName,
      mail: graphUser.mail,
      userPrincipalName: graphUser.userPrincipalName,
      givenName: graphUser.givenName,
      surname: graphUser.surname,
      jobTitle: graphUser.jobTitle,
      department: graphUser.department,
      accountEnabled: graphUser.accountEnabled
    };
  }

  /**
   * Mapper plusieurs utilisateurs
   */
  private mapGraphUsersToMicrosoftUsers(graphUsers: GraphApiUser[]): MicrosoftUser[] {
    return graphUsers.map(user => this.mapGraphUserToMicrosoftUser(user));
  }

  /**
   * Vérifier si l'erreur est "utilisateur non trouvé"
   */
  private isUserNotFoundError(error: any): boolean {
    const errorObj = error as any;
    return errorObj?.response?.status === 404 ||
           errorObj?.statusCode === 404 ||
           errorObj?.code === 'Request_ResourceNotFound';
  }

  /**
   * Gérer les erreurs de manière centralisée
   */
  private handleError(
    error: any,
    defaultCode: string,
    defaultMessage: string
  ): GraphOperationResult<any> {
    console.error(defaultMessage, error);

    let code = defaultCode;
    let message = defaultMessage;

    if (this.rateLimitService.isAuthenticationError(error)) {
      code = 'AUTH_ERROR';
      message = 'Erreur d\'authentification Microsoft Graph';
    } else if (this.rateLimitService.isPermissionError(error)) {
      code = 'PERMISSION_ERROR';
      message = 'Permissions insuffisantes pour cette opération';
    } else if (this.rateLimitService.isRateLimitError(error)) {
      code = 'RATE_LIMIT_ERROR';
      message = 'Limite de taux dépassée, veuillez réessayer plus tard';
    }

    return {
      success: false,
      error: {
        code,
        message,
        details: error
      }
    };
  }
}