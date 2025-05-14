module.exports = {
  run: [
    // --- .env Configuration ---
    {
      method: "shell.run",
      params: {
        path: "app", // DeerFlow project is in 'app/' subdirectory
        // Using bash -c for better control over complex commands and functions
        message: `bash -c '
          echo "[apply_config.js - .env] In directory: $(pwd)"
          echo "[apply_config.js - .env] Starting .env configuration..."

          if [ ! -f .env ]; then
            if [ -f .env.example ]; then
              cp .env.example .env && echo "[.env] Created from .env.example."
            else
              echo "# .env file created by DeerFlow configurator" > .env && echo "[.env] Created new .env (no example found)."
            fi
          else
            echo "[.env] .env file already exists. Will update."
          fi

          # Function to set/update environment variables
          # This version uses awk for safer in-place editing, especially across platforms.
          _set_env_var() {
            _KEY="$1"
            _VALUE="$2"
            _TEMP_FILE=".env.tmp.$$" # Process-specific temp file

            # Prepare value: escape backslashes, then double quotes, then wrap in double quotes for .env
            _PRINTF_VALUE=$(printf "%s" "$_VALUE" | sed "s/\\\\/\\\\\\\\/g; s/\\\"/\\\\\\\"/g")
            _LINE_TO_WRITE="${_KEY}=\\"${_PRINTF_VALUE}\\""
            
            if grep -q "^\${_KEY}=" .env; then
              awk -v key="$_KEY" -v new_line="$_LINE_TO_WRITE" \\
                "BEGIN{FS=OFS=\\"=\\"} \$1==key {\$0=new_line} 1" .env > "$_TEMP_FILE" && mv "$_TEMP_FILE" .env
            else
              echo "$_LINE_TO_WRITE" >> .env
            fi
            echo "[.env] Set/Updated: ${_KEY}"
          }

          _set_env_var "DEBUG" "{{args.env_debug || "True"}}"
          _set_env_var "APP_ENV" "{{args.env_app_env || "development"}}"
          _set_env_var "NEXT_PUBLIC_API_URL" "{{args.env_next_public_api_url || "http://localhost:8000/api"}}"
          _set_env_var "SEARCH_API" "{{args.env_search_api || "tavily"}}"
          _set_env_var "TAVILY_API_KEY" "{{args.env_tavily_api_key || ""}}"
          _set_env_var "BRAVE_SEARCH_API_KEY" "{{args.env_brave_search_api_key || ""}}"
          _set_env_var "JINA_API_KEY" "{{args.env_jina_api_key || ""}}"
          _set_env_var "VOLCENGINE_TTS_APPID" "{{args.env_volcengine_tts_appid || ""}}"
          _set_env_var "VOLCENGINE_TTS_ACCESS_TOKEN" "{{args.env_volcengine_tts_access_token || ""}}"
          _set_env_var "VOLCENGINE_TTS_CLUSTER" "{{args.env_volcengine_tts_cluster || "volcano_tts"}}"
          _set_env_var "VOLCENGINE_TTS_VOICE_TYPE" "{{args.env_volcengine_tts_voice_type || "BV700_V2_streaming"}}"
          
          echo "[.env] .env file configuration complete."
        '`,
        comment: "Configuring .env file in ./app directory..."
      }
    },
    // --- conf.yaml Configuration ---
    {
      method: "shell.run",
      params: {
        path: "app", // DeerFlow project is in 'app/' subdirectory
        message: (args) => {
          let yamlLines = [
            `# [!NOTE]`,
            `# Read the \`docs/configuration_guide.md\` carefully for DeerFlow specific examples.`,
            `# For a comprehensive list of LiteLLM supported providers, model strings, and API key requirements (often via .env),`,
            `# please consult the official LiteLLM Providers Documentation: https://docs.litellm.ai/docs/providers`,
            ``,
            `BASIC_MODEL:`
          ];
          
          const provider = args.yaml_provider || "openai";
          let model = args.yaml_model || "";
          if (!model && provider === "openai") model = "gpt-4o"; // Default for OpenAI
          
          const apiKey = args.yaml_api_key || "";
          const baseUrl = args.yaml_base_url || "";
          const apiBase = args.yaml_api_base || ""; // Azure specific
          const apiVersion = args.yaml_api_version || ""; // Azure specific

          // Function to format values for YAML, ensuring strings are quoted if they might be ambiguous
          function formatYamlValue(value) {
            if (typeof value !== 'string' || value === null || value === undefined) {
              return value; // Return non-strings or null/undefined as is (though null/undefined shouldn't happen with || "" defaults)
            }
            if (value === "") return '""'; // Explicitly quote empty strings for clarity in YAML
            
            // Keep $VARIABLES unquoted if they are simple placeholders (for LiteLLM .env resolution)
            if (value.startsWith('$') && /^[A-Za-z0-9_]+$/.test(value.substring(1))) {
                return value;
            }
            // If it looks like a number, boolean, or contains YAML special characters, or has leading/trailing spaces
            if (/^(\d+(\.\d+)?|-?\d+)$/.test(value) || /^(true|false|yes|no|null|on|off)$/i.test(value) || /[#:]/.test(value) || value.trim() !== value || value.includes('"') || value.includes("'")) {
                // Escape backslashes, then double quotes, then wrap in double quotes
                const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                return `"${escaped}"`;
            }
            return value; // Return as is if it seems like a simple unquoted string
          }

          yamlLines.push(`  model: ${formatYamlValue(model)}`);

          if (provider === 'openai') {
            yamlLines.push(`  base_url: "https://api.openai.com/v1"`); // Fixed for OpenAI
            if (apiKey) yamlLines.push(`  api_key: ${formatYamlValue(apiKey)}`);
          } else if (provider === 'openai_compatible') {
            if (baseUrl) yamlLines.push(`  base_url: ${formatYamlValue(baseUrl)}`);
            if (apiKey) yamlLines.push(`  api_key: ${formatYamlValue(apiKey)}`);
          } else if (provider === 'ollama') {
            yamlLines.push(`  base_url: ${formatYamlValue(baseUrl || "http://localhost:11434")}`);
            // Ollama usually doesn't need api_key in conf.yaml
          } else if (provider === 'openrouter') {
            yamlLines.push(`  base_url: ${formatYamlValue(baseUrl || "https://openrouter.ai/api/v1")}`);
            if (apiKey) yamlLines.push(`  api_key: ${formatYamlValue(apiKey)}`);
          } else if (provider === 'azure') {
            if (apiBase) yamlLines.push(`  api_base: ${formatYamlValue(apiBase)}`);
            if (apiVersion) yamlLines.push(`  api_version: ${formatYamlValue(apiVersion)}`);
            if (apiKey) yamlLines.push(`  api_key: ${formatYamlValue(apiKey)}`);
          } else if (provider === 'custom_litellm') {
            if (baseUrl) yamlLines.push(`  base_url: ${formatYamlValue(baseUrl)}`);
            if (apiKey) yamlLines.push(`  api_key: ${formatYamlValue(apiKey)}`);
            yamlLines.push(``); // Blank line for readability
            yamlLines.push(`# For 'Custom LiteLLM Provider', ensure necessary environment variables (e.g., ANTHROPIC_API_KEY, GROQ_API_KEY)`);
            yamlLines.push(`# are set in your .env file if an api_key is not provided directly here or if the provider requires it.`);
          }
          
          const yamlFileContent = yamlLines.join("\n");
          // Escape single quotes for the outer shell 'echo' command that writes the file
          const shellSafeYamlContent = yamlFileContent.replace(/'/g, "'\\''"); 

          // Use printf for potentially better handling of newlines and special characters by echo/shell
          // Ensure conf.yaml exists, copy from example if not
          let scriptCommands = `
            echo '[apply_config.js - conf.yaml] In directory: $(pwd)'
            echo '[apply_config.js - conf.yaml] Starting conf.yaml configuration...'
            if [ ! -f conf.yaml ]; then
              if [ -f conf.yaml.example ]; then
                cp conf.yaml.example conf.yaml && echo '[conf.yaml] Created from conf.yaml.example.'
              else
                echo '# conf.yaml created by DeerFlow configurator (no example found)' > conf.yaml && echo '[conf.yaml] Created new conf.yaml.'
              fi
            else
              echo '[conf.yaml] conf.yaml already exists. Will overwrite BASIC_MODEL section.'
            fi
            
            printf '%s\\n' '${shellSafeYamlContent}' > conf.yaml
            echo '[conf.yaml] conf.yaml configuration complete.'
          `;
          return `bash -c '${scriptCommands.replace(/'/g, "'\\''")}'`; // Wrap all commands in bash -c '...'
        },
        comment: "Configuring conf.yaml file in ./app directory..."
      }
    },
    {
      method: "notify",
      params: {
        html: "DeerFlow configuration applied!" // Simplest possible notification
      }
    }
  ]
}