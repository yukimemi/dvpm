function! health#dvpm#check() abort
  let name = get(g:, 'dvpm_plugin_name', '')
  if empty(name)
    call health#report_error('Dvpm is not initialized or g:dvpm_plugin_name is not set.')
    return
  endif

  try
    let result = denops#request(name, 'checkHealth', [])
  catch
    call health#report_error('Failed to request checkHealth: ' . v:exception)
    return
  endtry

  call health#report_start('dvpm report')
  
  if empty(result)
    call health#report_warn('No health check results returned.')
    return
  endif

  for item in result
    if !has_key(item, 'type') || !has_key(item, 'msg')
      call health#report_error('Invalid result format: ' . string(item))
      continue
    endif

    if item.type == 'ok'
      call health#report_ok(item.msg)
    elseif item.type == 'warn'
      call health#report_warn(item.msg)
    elseif item.type == 'error'
      call health#report_error(item.msg)
    elseif item.type == 'info'
      call health#report_info(item.msg)
    else
      call health#report_info(item.msg)
    endif
  endfor
endfunction
