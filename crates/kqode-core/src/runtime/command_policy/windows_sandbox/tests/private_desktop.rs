use super::super::native::wide;
use super::private_station::{Restore, Station};
use crate::runtime::windows_security::PrivateDescriptor;
use std::{io, ptr};
use windows_sys::Win32::{
    Foundation::GENERIC_ALL,
    Security::SECURITY_ATTRIBUTES,
    System::StationsAndDesktops::{
        CloseDesktop, CreateDesktopW, GetProcessWindowStation, GetUserObjectInformationW, HDESK,
        UOI_NAME,
    },
};

/// An invisible, freshly named desktop; never changes the default desktop DACL.
pub(super) struct Desktop {
    handle: HDESK,
    station: Option<Station>,
    pub name: Vec<u16>,
}

impl Desktop {
    pub fn new(package: &str, scope: &str, private_station: bool) -> io::Result<Self> {
        let descriptor =
            PrivateDescriptor::for_probe(&[(package, GENERIC_ALL), (scope, GENERIC_ALL)], true)?;
        let name = format!("KQodeProbe{}", uuid::Uuid::new_v4().simple());
        let text = wide(&name)?;
        let mut attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor.raw(),
            bInheritHandle: 0,
        };
        let mut restore = Restore::capture()?;
        let station = if private_station {
            let station = Station::new(&mut attributes)?;
            Some(station)
        } else {
            None
        };
        let selection = station.as_ref().map_or(Ok(()), Station::select);
        let result = selection.and_then(|()| Self::create(&text, &name, &mut attributes));
        let restoration = restore.restore();
        match (result, restoration) {
            (Ok(mut desktop), Ok(())) => {
                desktop.station = station;
                Ok(desktop)
            }
            (Err(error), Ok(())) | (Ok(_), Err(error)) => Err(error),
            (Err(primary), Err(restoration)) => Err(io::Error::other(format!(
                "{primary}; restoration failed: {restoration}"
            ))),
        }
    }

    fn create(text: &[u16], name: &str, attributes: &mut SECURITY_ATTRIBUTES) -> io::Result<Self> {
        let station = unsafe { GetProcessWindowStation() };
        if station.is_null() {
            return Err(io::Error::last_os_error());
        }
        let mut buffer = [0u16; 256];
        let mut required = 0;
        if unsafe {
            GetUserObjectInformationW(
                station,
                UOI_NAME,
                buffer.as_mut_ptr().cast(),
                size_of_val(&buffer) as u32,
                &mut required,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        let length = buffer
            .iter()
            .position(|unit| *unit == 0)
            .ok_or_else(|| io::Error::other("unterminated window-station name"))?;
        let station = String::from_utf16(&buffer[..length]).map_err(io::Error::other)?;
        let name = wide(format!("{station}\\{name}"))?;
        let handle = unsafe {
            CreateDesktopW(
                text.as_ptr(),
                ptr::null(),
                ptr::null(),
                0,
                GENERIC_ALL,
                attributes,
            )
        };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        Ok(Self {
            handle,
            station: None,
            name,
        })
    }

    pub fn close(&mut self) -> io::Result<()> {
        if !self.handle.is_null() {
            if unsafe { CloseDesktop(self.handle) } == 0 {
                return Err(io::Error::last_os_error());
            }
            self.handle = ptr::null_mut();
        }
        if let Some(station) = &mut self.station {
            station.close()?;
        }
        Ok(())
    }
}
impl Drop for Desktop {
    fn drop(&mut self) {
        if let Err(error) = self.close() {
            eprintln!("private probe desktop cleanup failed: {error}");
        }
    }
}
