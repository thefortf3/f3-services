const fetch = require('node-fetch');

/**
 * GloomSchedule API Client
 * 
 * A client library for interacting with the GloomSchedule API endpoints.
 * Handles authentication, token management, and API requests.
 */
class GloomScheduleClient {
  /**
   * Create a GloomSchedule API client
   * @param {Object} config - Configuration object
   * @param {string} config.apiKey - The GloomSchedule API key
   * @param {string} config.baseUrl - Base URL for the API (required)
   */
  constructor(config) {
    if (!config || !config.apiKey) {
      throw new Error('API key is required');
    }

    if (!config.baseUrl) {
      throw new Error('Base URL is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.token = null;
    this.tokenExpiresAt = null;
    this.regionId = null;
    this.regionName = null;
  }

  /**
   * Request a new authentication token
   * @returns {Promise<Object>} Token response with token, expiration, and region info
   */
  async requestToken() {
    const url = `${this.baseUrl}/api-request-token`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ api_key: this.apiKey })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to request token: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Store token and metadata
      this.token = data.token;
      this.tokenExpiresAt = new Date(data.expires_at);
      this.regionId = data.region_id;
      this.regionName = data.region_name;

      return data;
    } catch (error) {
      throw new Error(`Error requesting token: ${error.message}`);
    }
  }

  /**
   * Check if the current token is valid and not expired
   * @returns {boolean} True if token is valid
   */
  isTokenValid() {
    if (!this.token || !this.tokenExpiresAt) {
      return false;
    }

    // Check if token expires in the next 60 seconds (buffer for safety)
    const now = new Date();
    const bufferTime = 60 * 1000; // 60 seconds
    return this.tokenExpiresAt.getTime() - now.getTime() > bufferTime;
  }

  /**
   * Ensure we have a valid token, requesting a new one if needed
   * @returns {Promise<string>} Valid token
   */
  async ensureValidToken() {
    if (!this.isTokenValid()) {
      await this.requestToken();
    }
    return this.token;
  }

  /**
   * Get AO (Area of Operation) details
   * @param {Object} options - Query options
   * @param {boolean} [options.activeOnly=true] - Only return active AOs
   * @returns {Promise<Object>} AO details with region info and list of AOs
   */
  async getAODetails(options = {}) {
    const token = await this.ensureValidToken();
    const activeOnly = options.activeOnly !== undefined ? options.activeOnly : true;
    
    const url = `${this.baseUrl}/api-get-ao?token=${token}&activeOnly=${activeOnly}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get AO details: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Error getting AO details: ${error.message}`);
    }
  }

  /**
   * Get scheduled Qs for a specific date
   * @param {string|Date} date - Date to get schedule for (YYYY-MM-DD format or Date object)
   * @returns {Promise<Object>} Schedule details with region info and scheduled events
   */
  async getScheduledQs(date) {
    const token = await this.ensureValidToken();
    
    // Convert Date object to YYYY-MM-DD string if needed
    let dateStr = date;
    if (date instanceof Date) {
      dateStr = date.toISOString().split('T')[0];
    }

    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error('Date is required and must be a string (YYYY-MM-DD) or Date object');
    }

    const url = `${this.baseUrl}/api-get-scheduled-qs?token=${token}&date=${dateStr}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get scheduled Qs: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Error getting scheduled Qs: ${error.message}`);
    }
  }

  /**
   * Get the current region information
   * @returns {Object|null} Object with regionId and regionName, or null if not authenticated
   */
  getRegionInfo() {
    if (!this.regionId || !this.regionName) {
      return null;
    }

    return {
      id: this.regionId,
      name: this.regionName
    };
  }

  /**
   * Get token expiration information
   * @returns {Object|null} Object with token and expiration date, or null if no token
   */
  getTokenInfo() {
    if (!this.token || !this.tokenExpiresAt) {
      return null;
    }

    return {
      token: this.token,
      expiresAt: this.tokenExpiresAt,
      isValid: this.isTokenValid()
    };
  }

  /**
   * Clear the current token and force re-authentication on next request
   */
  clearToken() {
    this.token = null;
    this.tokenExpiresAt = null;
  }
}

module.exports = GloomScheduleClient;
