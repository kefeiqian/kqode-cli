use std::{io, ptr};
use windows_sys::Win32::{
    Foundation::GENERIC_ALL,
    Security::SECURITY_ATTRIBUTES,
    System::{
        StationsAndDesktops::{
            CloseWindowStation, CreateWindowStationW, GetProcessWindowStation, GetThreadDesktop,
            HDESK, HWINSTA, SetProcessWindowStation, SetThreadDesktop,
        },
        Threading::GetCurrentThreadId,
    },
};

const CREATE_ONLY: u32 = 1;

/// Test-process-only station ownership; never adopts an existing named station.
pub(super) struct Station(HWINSTA);
impl Station {
    pub fn new(attributes: &mut SECURITY_ATTRIBUTES) -> io::Result<Self> {
        let name =
            super::super::native::wide(format!("KQodeProbe{}", uuid::Uuid::new_v4().simple()))?;
        let handle =
            unsafe { CreateWindowStationW(name.as_ptr(), CREATE_ONLY, GENERIC_ALL, attributes) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(handle))
    }
    pub fn select(&self) -> io::Result<()> {
        if unsafe { SetProcessWindowStation(self.0) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    pub fn close(&mut self) -> io::Result<()> {
        if !self.0.is_null() {
            if unsafe { CloseWindowStation(self.0) } == 0 {
                return Err(io::Error::last_os_error());
            }
            self.0 = ptr::null_mut();
        }
        Ok(())
    }
}
impl Drop for Station {
    fn drop(&mut self) {
        if let Err(error) = self.close() {
            eprintln!("probe station cleanup failed: {error}");
        }
    }
}

/// Restores this test process/thread association before returning or awaiting.
pub(super) struct Restore {
    station: HWINSTA,
    desktop: HDESK,
    restored: bool,
}
impl Restore {
    pub fn capture() -> io::Result<Self> {
        let station = unsafe { GetProcessWindowStation() };
        let desktop = unsafe { GetThreadDesktop(GetCurrentThreadId()) };
        if station.is_null() || desktop.is_null() {
            return Err(io::Error::last_os_error());
        }
        Ok(Self {
            station,
            desktop,
            restored: false,
        })
    }
    pub fn restore(&mut self) -> io::Result<()> {
        if self.restored {
            return Ok(());
        }
        if unsafe { GetProcessWindowStation() } != self.station
            && unsafe { SetProcessWindowStation(self.station) } == 0
        {
            return Err(io::Error::last_os_error());
        }
        if unsafe { GetThreadDesktop(GetCurrentThreadId()) } != self.desktop
            && unsafe { SetThreadDesktop(self.desktop) } == 0
        {
            return Err(io::Error::last_os_error());
        }
        self.restored = true;
        Ok(())
    }
}
impl Drop for Restore {
    fn drop(&mut self) {
        if let Err(error) = self.restore() {
            eprintln!("probe station restoration failed: {error}");
        }
    }
}
