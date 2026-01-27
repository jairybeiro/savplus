export const evolutionClient = {
    checkConfig() {
        if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
            throw new Error('Evolution API env not configured. Please check EVOLUTION_API_URL and EVOLUTION_API_KEY.');
        }
    },

    async request(endpoint: string, method: string = 'GET', body?: any) {
        this.checkConfig();
        // Ensure base URL doesn't have trailing slash and endpoint has leading slash
        const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '');
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${baseUrl}${cleanEndpoint}`;

        const apiKey = process.env.EVOLUTION_API_KEY;

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey || '',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // Handle V2 already exists error
            // V2 format: { status: 403, error: "Forbidden", response: { message: ["...already in use."] } }
            const errorMessage = data.response?.message?.[0] || data.message || `Evolution API error: ${response.status}`;

            if (response.status === 403 && (errorMessage.includes('already in use') || errorMessage.includes('already exists'))) {
                return { alreadyExists: true, ...data };
            }

            throw new Error(errorMessage);
        }

        return data;
    },

    async createInstance(instanceName: string) {
        // V2 requires 'integration' field
        return this.request('/instance/create', 'POST', {
            instanceName,
            token: Math.random().toString(36).substring(7),
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
        });
    },

    async connectInstance(instanceName: string) {
        return this.request(`/instance/connect/${encodeURIComponent(instanceName)}`, 'GET');
    },

    async getInstanceStatus(instanceName: string) {
        try {
            const data = await this.request(`/instance/connectionState/${encodeURIComponent(instanceName)}`, 'GET');
            return data.instance?.state || 'disconnected';
        } catch (e) {
            return 'disconnected';
        }
    },

    async logoutInstance(instanceName: string) {
        return this.request(`/instance/logout/${encodeURIComponent(instanceName)}`, 'DELETE');
    },

    async deleteInstance(instanceName: string) {
        return this.request(`/instance/delete/${encodeURIComponent(instanceName)}`, 'DELETE');
    },

    async sendMessage(instanceName: string, number: string, text: string) {
        return this.request(`/message/sendText/${encodeURIComponent(instanceName)}`, 'POST', {
            number: number.replace(/\D/g, ''),
            text,
            linkPreview: false,
        });
    }
};
