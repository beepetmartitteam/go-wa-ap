const { Pool } = require('pg');
const axios = require('axios');
const logger = require('../utils/logger');
const autoReplyService = require('./autoReplyService');

// Use shared database configuration
const { db } = require('../config/database');

class EvolutionService {
  constructor() {
      const isDevelopment =
        process.env.NODE_ENV === 'development';

      this.evolutionServiceApiKey =
        process.env.EVOLUTION_SERVICE_API_KEY ||
        process.env.CHATFLOW_API_KEY;

      this.instances = {
        'chatflow-1': {
          url: process.env.CHATFLOW_INSTANCE_1,
          publicUrl: process.env.CHATFLOW_PUBLIC_1,
          apiKey: this.evolutionServiceApiKey
        },

        'chatflow-2': {
          url: process.env.CHATFLOW_INSTANCE_2,
          publicUrl: process.env.CHATFLOW_PUBLIC_2,
          apiKey: this.evolutionServiceApiKey
        }
      };


      this.evolutionApiUrl = isDevelopment
        ? 'http://localhost:8081'
        : (
            process.env.EVOLUTION_API_URL ||
            process.env.CHATFLOW_API_URL ||
            process.env.CHATFLOW_INSTANCE_1
          );

      this.evolutionApiKey =
        this.evolutionServiceApiKey;

      this.evolutionApiPublicUrl = isDevelopment
        ? 'http://localhost:8081'
        : process.env.SERVER_URL;
    }
 // Get instance URL and API key
getInstanceConfig(instanceName) {
  return this.instances[instanceName] || {
    url: this.evolutionApiUrl,
    publicUrl: this.evolutionApiPublicUrl,
    apiKey: this.evolutionApiKey
  };
}

  // Create new instance in ChatFlow
  async createInstance(phoneData, evolutionInstance = 'chatflow-1')
  {
    try {

      const instanceConfig =this.getInstanceConfig(evolutionInstance);

      // Based on go-whatsapp-web-multidevice documentation, use POST /devices endpoint
      const response = await axios.post(`${instanceConfig.url}/devices`, {
        device_id: phoneData.deviceName,
        number: phoneData.phoneNumber,
        webhook: `${process.env.SERVER_URL}/webhook/evolution`,
        webhook_secret: phoneData.webhookSecret
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`
        },
        timeout: 30000
      });

      logger.info('ChatFlow device created:', {
        deviceName: phoneData.deviceName,
        phoneNumber: phoneData.phoneNumber,
        deviceId: response.data.results?.id
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to create ChatFlow device:', {
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        message: error.response?.data?.message || error.message
      };
    }
  }

  // Generate QR code for existing instance
  async generateQR(phoneId, forceGenerate = false) {
    try {
      logger.info('Starting QR generation for phoneId:', phoneId, 'forceGenerate:', forceGenerate);
      
      // Get phone details from database
      const phoneQuery = 'SELECT * FROM phone_numbers WHERE id = $1';
      const phoneResult = await db.query(phoneQuery, [phoneId]);
      const phone = phoneResult.rows[0];

      if (!phone) {
        logger.error('Phone not found for phoneId:', phoneId);
        return {
          success: false,
          message: 'Phone not found',
          phoneId
        };
      }

      logger.info('Found phone:', { phoneId: phone.id, deviceName: phone.device_name, isConnected: phone.is_connected });

      // Check if ChatFlow is available
      const evolutionInstance = phone.evolution_instance || 'chatflow-1';
      const instanceConfig = this.getInstanceConfig(evolutionInstance);
      
      try {
        logger.info('Getting QR code from ChatFlow:', {
          evolutionInstance,
          url: instanceConfig.url,
          deviceName: phone.device_name
        });
        
        // ✅ CORRECT: Use GET /app/login endpoint to trigger QR generation
        const loginResponse = await axios.get(
          `${instanceConfig.url}/app/login`,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`,
              'X-Device-Id': phone.device_name
            },
            timeout: 15000
          }
        );

        logger.info('Login response:', loginResponse.data);

        // Check if device exists, if not create it first
        if (loginResponse.data?.message?.includes('device not found') ||
            loginResponse.data?.message?.includes('create a device first')) {
          
          logger.info('Device not found, creating device first:', {
            deviceName: phone.device_name,
            phoneNumber: phone.phone_number
          });

          // Create device first
          /*
          const createResult = await this.createInstance({
            deviceName: phone.device_name,
            phoneNumber: phone.phone_number,
            webhookUrl: phone.webhook_url,
            webhookSecret: phone.webhook_secret
          });
          */
         const createResult = await this.createInstance(
          {
            deviceName: phone.device_name,
            phoneNumber: phone.phone_number,
            webhookUrl: phone.webhook_url,
            webhookSecret: phone.webhook_secret
          },
          evolutionInstance
        );


          if (createResult.success) {
            logger.info('Device created successfully, retrying QR generation');
            
            // Retry QR generation after device creation
            return await this.generateQR(phoneId, forceGenerate);
          } else {
            logger.error('Failed to create device:', createResult.message);
            throw new Error(createResult.message);
          }
        }

        // Check for direct ALREADY_LOGGED_IN response
        if (loginResponse.data?.code === 'ALREADY_LOGGED_IN' ||
            loginResponse.data?.message?.includes('already logged in')) {
          
          // Update database status to connected
          await db.query(
            'UPDATE phone_numbers SET is_connected = true, updated_at = NOW() WHERE id = $1',
            [phoneId]
          );
          
          return {
            success: true,
            qrCode: null,
            message: 'Device is already logged in to WhatsApp',
            status: 'connected',
            phoneId: phoneId,
            deviceName: phone.device_name,
            phoneNumber: phone.phone_number,
            evolutionApiUrl: instanceConfig.url,
            source: 'chatflow'
          };
        }

        // Check if QR code is available
        if (loginResponse.data && loginResponse.data.code === 'SUCCESS') {
          const qrData = loginResponse.data.results;
          
          // Check for QR code in multiple possible fields
          let qrCodePath = null;
          
          if (qrData && qrData.qrcode) {
            qrCodePath = qrData.qrcode;
          } else if (qrData && qrData.qr_link) {
            qrCodePath = qrData.qr_link;
          } else if (qrData && qrData.qr_code) {
            qrCodePath = qrData.qr_code;
          }
          
          if (qrCodePath) {
            // Handle both relative and absolute URLs
            let fullQrUrl;
            const publicBaseUrl =instanceConfig.publicUrl

            if (qrCodePath.startsWith('http')) {
              fullQrUrl = `${publicBaseUrl}${qrCodePath}`;
            } else {
              fullQrUrl = `${publicBaseUrl}${qrCodePath}`;
            }

            // Update phone with QR code URL
            const updateQuery = 'UPDATE phone_numbers SET qr_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2';
            await db.query(updateQuery, [fullQrUrl, phoneId]);

            logger.info('QR code generated successfully:', {
              phoneId,
              deviceName: phone.device_name,
              qrCodePath,
              fullQrUrl
            });

            return {
              success: true,
              qrCode: fullQrUrl,
              qrCodeBase64: qrData.qrcode_base64 || null,
              message: 'QR code generated successfully',
              phoneId: phoneId,
              deviceName: phone.device_name,
              phoneNumber: phone.phone_number,
              evolutionApiUrl: instanceConfig.url,
              source: 'chatflow'
            };
          } else {
            // No QR code found - device might be connected
            return {
              success: true,
              qrCode: null,
              message: 'No QR code available. Device may already be connected.',
              status: 'check_connection',
              phoneId: phoneId,
              deviceName: phone.device_name,
              phoneNumber: phone.phone_number,
              evolutionApiUrl: instanceConfig.url,
              source: 'chatflow'
            };
          }
        }

        // If no QR in response, check status
        if (loginResponse.data && loginResponse.data.results) {
          const status = loginResponse.data.results.status || loginResponse.data.results.message;
          
          // Check if device is already connected
          if (loginResponse.data.results.connected === true || 
              loginResponse.data.results.status === 'CONNECTED' ||
              loginResponse.data.results.message?.includes('already connected') ||
              loginResponse.data.results.message?.includes('already logged in')) {
            
            if (forceGenerate) {
              // Force disconnect first, then generate QR
              logger.info('Force generating QR - disconnecting first');
              await this.disconnectPhone(phoneId);
              
              // Wait a moment for disconnection to complete
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Retry QR generation
              return await this.generateQR(phoneId, false);
            }
            
            return {
              success: true,
              qrCode: null,
              message: 'Device is already connected to WhatsApp',
              status: 'connected',
              phoneId: phoneId,
              deviceName: phone.device_name,
              phoneNumber: phone.phone_number,
              evolutionApiUrl: instanceConfig.url,
              source: 'chatflow'
            };
          }
          
          // Handle "already logged in" case
          if (loginResponse.data.results.message?.includes('already logged in')) {
            // Update database status to connected
            await db.query(
              'UPDATE phone_numbers SET is_connected = true, qr_code = NULL, updated_at = NOW() WHERE id = $1',
              [phoneId]
            );
            
            return {
              success: true,
              qrCode: null,
              message: 'Device is already logged in to WhatsApp',
              status: 'connected',
              phoneId: phoneId,
              deviceName: phone.device_name,
              phoneNumber: phone.phone_number,
              evolutionApiUrl: instanceConfig.url,
              source: 'chatflow'
            };
          }
          
          if (forceGenerate) {
            // Force disconnect first, then generate QR
            logger.info('Force generating QR - disconnecting first');
            await this.disconnectPhone(phoneId);
            
            // Wait a moment for disconnection to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Retry QR generation
            return await this.generateQR(phoneId, false);
          }
          
          return {
            success: true,
            qrCode: null,
            message: status || 'Device may already be connected',
            status: 'check_connection',
            phoneId: phoneId,
            deviceName: phone.device_name,
            phoneNumber: phone.phone_number,
            evolutionApiUrl: instanceConfig.url,
            source: 'chatflow'
          };
        }

      } catch (evolutionError) {
        logger.warn('ChatFlow error:', {
          error: evolutionError.message,
          response: evolutionError.response?.data,
          evolutionInstance,
          phoneId
        });

        // If device not found, try to create it first
        if (evolutionError.response?.status === 404 || 
            evolutionError.response?.data?.message?.includes('not found')) {
          
          logger.info('Device not found, creating new device...');
          
          const createResult = await this.createInstance({
            deviceName: phone.device_name,
            phoneNumber: phone.phone_number,
            webhookUrl: phone.webhook_url,
            webhookSecret: phone.webhook_secret
          });

          if (createResult.success) {
            // Retry getting QR code
            return await this.generateQR(phoneId, forceGenerate);
          }
        }

        // Check for ALREADY_LOGGED_IN in error response
        if (evolutionError.response?.data?.code === 'ALREADY_LOGGED_IN' ||
            evolutionError.response?.data?.message?.includes('already logged in')) {
          
          // Update database status to connected
          await db.query(
            'UPDATE phone_numbers SET is_connected = true, qr_code = NULL, updated_at = NOW() WHERE id = $1',
            [phoneId]
          );
          
          return {
            success: true,
            qrCode: null,
            message: 'Device is already logged in to WhatsApp',
            status: 'connected',
            phoneId: phoneId,
            deviceName: phone.device_name,
            phoneNumber: phone.phone_number,
            evolutionApiUrl: instanceConfig.url,
            source: 'chatflow'
          };
        }

        return {
          success: false,
          message: evolutionError.response?.data?.message || evolutionError.message,
          phoneId: phoneId,
          evolutionApiUrl: instanceConfig.url
        };
      }

      // Fallback: No QR code available
      return {
        success: false,
        message: 'Unable to generate QR code. Device may already be connected or API error.',
        phoneId: phoneId,
        deviceName: phone.device_name,
        evolutionApiUrl: instanceConfig.url
      };

    } catch (error) {
      logger.error('Failed to generate QR code:', {
        error: error.message,
        stack: error.stack,
        phoneId
      });
      
      return {
        success: false,
        message: 'Failed to generate QR code: ' + error.message,
        phoneId
      };
    }
  }

  // Disconnect phone from WhatsApp
  async disconnectPhone(phoneId) {
    try {
      logger.info('Disconnecting phone:', phoneId);
      
      // Get phone details from database
      const phoneQuery = 'SELECT * FROM phone_numbers WHERE id = $1';
      const phoneResult = await db.query(phoneQuery, [phoneId]);
      const phone = phoneResult.rows[0];

      if (!phone) {
        logger.error('Phone not found for disconnect:', phoneId);
        return {
          success: false,
          message: 'Phone not found',
          phoneId
        };
      }

      logger.info('Found phone for disconnect:', { phoneId: phone.id, deviceName: phone.device_name });

      // Get instance configuration
      const evolutionInstance = phone.evolution_name || 'chatflow-1';
      const instanceConfig = this.getInstanceConfig(evolutionInstance);
      
      try {
        logger.info('Disconnecting from ChatFlow:', {
          evolutionInstance,
          url: instanceConfig.url,
          deviceName: phone.device_name
        });
        
        // Call ChatFlow logout endpoint
        const logoutResponse = await axios.post(
          `${instanceConfig.url}/app/logout`,
          {
            device_id: phone.device_name
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`
            },
            timeout: 15000
          }
        );

        logger.info('Logout response:', logoutResponse.data);

        // Update database status
        const updateQuery = 'UPDATE phone_numbers SET is_connected = false, last_seen = NULL, qr_code = NULL, session_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1';
        await db.query(updateQuery, [phoneId]);

        logger.info('Phone disconnected successfully:', phoneId);

        return {
          success: true,
          message: 'Phone disconnected successfully',
          phoneId: phoneId,
          deviceName: phone.device_name
        };

      } catch (evolutionError) {
        logger.warn('ChatFlow disconnect error:', {
          error: evolutionError.message,
          response: evolutionError.response?.data,
          evolutionInstance,
          phoneId
        });

        // Even if ChatFlow API fails, update database to disconnected state
        const updateQuery = 'UPDATE phone_numbers SET is_connected = false, last_seen = NULL, qr_code = NULL, session_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1';
        await db.query(updateQuery, [phoneId]);

        return {
          success: true,
          message: 'Phone disconnected (database updated)',
          phoneId: phoneId,
          deviceName: phone.device_name,
          warning: 'ChatFlow API disconnect failed, but database updated'
        };
      }

    } catch (error) {
      logger.error('Failed to disconnect phone:', {
        error: error.message,
        stack: error.stack,
        phoneId
      });
      
      return {
        success: false,
        message: 'Failed to disconnect phone: ' + error.message,
        phoneId
      };
    }
  }

  // Check connection status
  async getConnectionStatus(phoneId) {
    try {
      const phoneQuery = 'SELECT * FROM phone_numbers WHERE id = $1';
      const phoneResult = await db.query(phoneQuery, [phoneId]);
      const phone = phoneResult.rows[0];

      if (!phone) {
        throw new Error('Phone not found');
      }

      const evolutionInstance = phone.evolution_name || 'chatflow-1';
      const instanceConfig = this.getInstanceConfig(evolutionInstance);

      // Use GET /app/status endpoint with X-Device-Id header
      const response = await axios.get(`${instanceConfig.url}/app/status`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`,
          'X-Device-Id': phone.device_name
        },
        timeout: 10000
      });

      const isConnected = response.data.code === 'SUCCESS' && 
                         response.data.results?.connected === true;

      // Update connection status in database
      const updateQuery = 'UPDATE phone_numbers SET is_connected = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2';
      await db.query(updateQuery, [isConnected, phoneId]);

      return {
        success: true,
        connected: isConnected,
        phone: response.data.results?.phone || null,
        battery: response.data.results?.battery || null,
        plugged: response.data.results?.plugged || false,
        status: response.data.results?.status || 'unknown'
      };
    } catch (error) {
      logger.error('Failed to get connection status:', {
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        connected: false,
        message: error.message
      };
    }
  }

  // Send message through ChatFlow
  async sendMessage(phoneId, messageData) {
    try {
      const phoneQuery = 'SELECT * FROM phone_numbers WHERE id = $1';
      const phoneResult = await db.query(phoneQuery, [phoneId]);
      const phone = phoneResult.rows[0];

      if (!phone) {
        throw new Error('Phone not found');
      }

      if (!phone.is_connected) {
        throw new Error('Phone is not connected to WhatsApp');
      }

      const evolutionInstance = phone.evolution_name || 'chatflow-1';
      const instanceConfig = this.getInstanceConfig(evolutionInstance);

      // Use POST /send/message endpoint with X-Device-Id header
      const response = await axios.post(
        `${instanceConfig.url}/send/message`,
        {
          phone: `${messageData.to}@s.whatsapp.net`,
          message: messageData.message || messageData.content,
          is_forwarded: false
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`,
            'X-Device-Id': phone.device_name
          },
          timeout: 30000
        }
      );

      // Store message in database
      const messageQuery = `
        INSERT INTO messages (phone_number_id, message_id, from_number, to_number, message_type, content, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const messageResult = await db.query(messageQuery, [
        phoneId,
        response.data.results?.message_id || 'msg_' + Date.now(),
        phone.phone_number,
        messageData.to,
        'text',
        messageData.message || messageData.content,
        'sent'
      ]);
      const message = messageResult.rows[0];

      logger.info('Message sent successfully:', {
        messageId: message.id,
        to: messageData.to,
        phoneId
      });

      return {
        success: true,
        message: {
          id: message.id,
          from: phone.phone_number,
          to: messageData.to,
          content: messageData.content,
          status: 'sent',
          createdAt: message.created_at
        }
      };
    } catch (error) {
      logger.error('Failed to send message:', {
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        message: error.response?.data?.message || error.message
      };
    }
  }

  // Send group message through ChatFlow
  async sendGroupMessage(phoneId, messageData) {
    try {
      const phoneQuery = 'SELECT * FROM phone_numbers WHERE id = $1';
      const phoneResult = await db.query(phoneQuery, [phoneId]);
      const phone = phoneResult.rows[0];

      if (!phone) {
        throw new Error('Phone not found');
      }

      if (!phone.is_connected) {
        throw new Error('Phone is not connected to WhatsApp');
      }

      const evolutionInstance = phone.evolution_name || 'chatflow-1';
      const instanceConfig = this.getInstanceConfig(evolutionInstance);

      // Use POST /send endpoint with device_id query parameter
      const response = await axios.post(
        `${instanceConfig.url}/send?device_id=${phone.device_name}`,
        {
          group: messageData.group,
          message: messageData.text
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${instanceConfig.apiKey}`,
            'apikey': instanceConfig.apiKey
          },
          timeout: 30000
        }
      );

      // Store message in database
      const messageQuery = `
        INSERT INTO messages (phone_number_id, message_id, from_number, to_number, message_type, content, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const messageResult = await db.query(messageQuery, [
        phoneId,
        response.data.results?.message_id || 'msg_' + Date.now(),
        phone.phone_number,
        messageData.group,
        'text',
        messageData.text,
        'sent'
      ]);
      const message = messageResult.rows[0];

      logger.info('Group message sent successfully:', {
        messageId: message.id,
        to: messageData.group,
        phoneId
      });

      return {
        success: true,
        message: {
          id: message.id,
          from: phone.phone_number,
          to: messageData.group,
          content: messageData.text,
          status: 'sent',
          createdAt: message.created_at
        }
      };
    } catch (error) {
      logger.error('Failed to send group message:', {
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        message: error.response?.data?.message || error.message
      };
    }
  }

  // Logout/Disconnect device
  async logoutDevice(phoneId) {
    try {
      const phoneQuery = 'SELECT * FROM phone_numbers WHERE id = $1';
      const phoneResult = await db.query(phoneQuery, [phoneId]);
      const phone = phoneResult.rows[0];

      if (!phone) {
        throw new Error('Phone not found');
      }

      const evolutionInstance = phone.evolution_name || 'chatflow-1';
      const instanceConfig = this.getInstanceConfig(evolutionInstance);

      // Use GET /app/logout with X-Device-Id header
      await axios.get(`${instanceConfig.url}/app/logout`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`,
          'X-Device-Id': phone.device_name
        },
        timeout: 15000
      });

      // Update database
      const updateQuery = 'UPDATE phone_numbers SET is_connected = false, qr_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1';
      await db.query(updateQuery, [phoneId]);

      logger.info('Device logged out:', {
        phoneId,
        deviceName: phone.device_name
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to logout device:', {
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Delete instance from ChatFlow
  async deleteInstance(phoneId) {
    try {
      const phoneQuery = 'SELECT * FROM phone_numbers WHERE id = $1';
      const phoneResult = await db.query(phoneQuery, [phoneId]);
      const phone = phoneResult.rows[0];

      if (!phone) {
        throw new Error('Phone not found');
      }

      const evolutionInstance = phone.evolution_name || 'chatflow-1';
      const instanceConfig = this.getInstanceConfig(evolutionInstance);

      // Use DELETE /devices/{device_id} endpoint
      await axios.delete(`${instanceConfig.url}/devices/${phone.device_name}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`,
          'X-Device-Id': phone.device_name
        },
        timeout: 15000
      });

      logger.info('ChatFlow instance deleted:', {
        instanceName: phone.device_name,
        phoneNumber: phone.phone_number
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete ChatFlow instance:', {
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get list of devices
  async getDevices() {
    try {
      const response = await axios.get(`${this.evolutionApiUrl}/devices`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}`
        },
        timeout: 10000
      });

      return {
        success: true,
        devices: response.data.results || []
      };
    } catch (error) {
      logger.error('Failed to get devices:', {
        error: error.message,
        response: error.response?.data
      });
      
      return {
        success: false,
        devices: [],
        message: error.message
      };
    }
  }

  // Webhook handler for incoming messages
  async handleWebhook(webhookData) {
    try {
      logger.info('Received webhook from ChatFlow:', webhookData);

      // Handle connection status updates
      if (webhookData.event === 'connection.status' || webhookData.code === 'CONNECTION_UPDATE') {
        const deviceId = webhookData.device_id || webhookData.device;
        
        // Find phone by device name
        const phoneQuery = 'SELECT * FROM phone_numbers WHERE device_name = $1 LIMIT 1';
        const phoneResult = await db.query(phoneQuery, [deviceId]);
        const phone = phoneResult.rows[0];

        if (phone) {
          const isConnected = webhookData.results?.connected || webhookData.data?.connected || false;
          
          // Update phone connection status
          const updateQuery = `
            UPDATE phone_numbers
            SET is_connected = $1, 
                last_seen = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `;
          
          await db.query(updateQuery, [isConnected, phone.id]);

          logger.info('Connection status updated:', {
            phoneId: phone.id,
            deviceName: phone.device_name,
            isConnected: isConnected
          });
          
          // Emit real-time status update via WebSocket
          if (global.emitPhoneStatusUpdate) {
            global.emitPhoneStatusUpdate(phone.id, isConnected, phone.user_id);
          }
        }
      }

      // Handle incoming messages
      if (webhookData.event === 'message.received' || webhookData.code === 'MESSAGE_RECEIVED') {
        const deviceId = webhookData.device_id || webhookData.device;
        
        logger.info('EvolutionService: Processing message.received webhook', {
          deviceId,
          from: webhookData.results?.from || webhookData.data?.from,
          message: webhookData.results?.message || webhookData.data?.message
        });
        
        // Find phone by device name
        const phoneQuery = 'SELECT * FROM phone_numbers WHERE device_name = $1 LIMIT 1';
        const phoneResult = await db.query(phoneQuery, [deviceId]);
        const phone = phoneResult.rows[0];

        if (phone) {
          const messageData = webhookData.results || webhookData.data;
          
          logger.info('EvolutionService: Found phone for webhook:', { phoneId: phone.id, deviceName: phone.device_name });
          
          // Store incoming message
          const messageQuery = `
            INSERT INTO messages (phone_number_id, message_id, from_number, to_number, message_type, content, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING
          `;
          
          await db.query(messageQuery, [
            phone.id,
            messageData.id || messageData.message_id || 'msg_' + Date.now(),
            messageData.from || messageData.sender,
            phone.phone_number,
            messageData.type || 'text',
            messageData.message || messageData.text || '',
            'received',
            new Date()
          ]);

          logger.info('Message synced from webhook:', {
            from: messageData.from || messageData.sender,
            to: phone.phone_number
          });

          // Process auto-reply for incoming message
          try {
            logger.info('Processing auto-reply for message:', {
              from: messageData.from || messageData.sender,
              message: messageData.message || messageData.text || ''
            });

            const autoReply = await autoReplyService.processMessage(
              messageData.from || messageData.sender,
              messageData.message || messageData.text || ''
            );

            logger.info('Auto-reply result:', {
              shouldReply: autoReply.shouldReply,
              response: autoReply.response ? 'present' : 'absent',
              error: autoReply.error || 'none'
            });

            if (autoReply.shouldReply) {
              // Send auto-reply response
              await this.sendMessage(
                phone.id,
                {
                  to: messageData.from || messageData.sender,
                  message: autoReply.response
                }
              );

              logger.info('Auto-reply sent:', {
                to: messageData.from || messageData.sender,
                from: phone.phone_number,
                sessionId: autoReply.sessionId
              });
            }
          } catch (autoReplyError) {
            logger.error('Auto-reply processing error:', autoReplyError);
          }
        } else {
          logger.warn('No phone found for webhook device:', deviceId);
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to handle webhook:', {
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new EvolutionService();