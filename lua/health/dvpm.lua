local M = {}

M.check = function()
  local health = vim.health or require("health")
  local start = health.start or health.report_start
  local ok = health.ok or health.report_ok
  local warn = health.warn or health.report_warn
  local error = health.error or health.report_error
  local info = health.info or health.report_info

  start("dvpm report")

  local name = vim.g.dvpm_plugin_name
  if name == nil or name == "" then
    error("Dvpm is not initialized or g:dvpm_plugin_name is not set.")
    return
  end

  local result
  local success, msg = pcall(function()
    result = vim.fn["denops#request"](name, "checkHealth", {})
  end)

  if not success then
    error("Failed to request checkHealth: " .. tostring(msg))
    return
  end

  if result == nil or #result == 0 then
    warn("No health check results returned.")
    return
  end

  for _, item in ipairs(result) do
    if item.type == "ok" then
      ok(item.msg)
    elseif item.type == "warn" then
      warn(item.msg)
    elseif item.type == "error" then
      error(item.msg)
    elseif item.type == "info" then
      info(item.msg)
    else
      info(item.msg)
    end
  end
end

return M
